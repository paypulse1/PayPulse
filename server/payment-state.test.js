import { describe, expect, it, vi } from "vitest"
import { createPaymentStateService } from "./payment-state.js"

function createTransactionClient(initialStatus = "PENDING") {
  const calls = []
  let status = initialStatus
  let statusAtBegin = status
  const client = {
    query: vi.fn(async (sql, parameters = []) => {
      calls.push({ sql, parameters })
      if (sql === "BEGIN") {
        statusAtBegin = status
        return { rows: [] }
      }
      if (sql === "ROLLBACK") {
        status = statusAtBegin
        return { rows: [] }
      }
      if (sql === "COMMIT") return { rows: [] }
      if (sql.includes("SELECT status FROM payment_links")) {
        return { rowCount: 1, rows: [{ status }] }
      }
      if (sql.includes("SET status = 'EXECUTED'")) {
        status = "EXECUTED"
        return { rowCount: 1, rows: [] }
      }
      if (sql.includes("SET status = 'SETTLEMENT_RETRY'")) {
        if (
          [
            "CREATING",
            "ACTIVE",
            "PENDING",
            "OUTCOME_UNKNOWN",
            "SETTLEMENT_RETRY",
          ].includes(status)
        ) {
          status = "SETTLEMENT_RETRY"
        }
        return { rowCount: 1, rows: [] }
      }
      return { rowCount: 1, rows: [] }
    }),
    release: vi.fn(),
  }
  return { client, calls, getStatus: () => status }
}

describe("payment collection state", () => {
  it("commits payment status, ledger settlement, and both outboxes together", async () => {
    const { client, calls } = createTransactionClient()
    const pool = { connect: vi.fn(async () => client) }
    const settleSuccessfulCollection = vi.fn(async (_id, executor) => {
      expect(executor).toBe(client)
    })
    const queueSuccessfulTransaction = vi.fn(async (_type, _id, executor) => {
      expect(executor).toBe(client)
    })
    const queueTransactionWebhook = vi.fn(async (_type, _id, executor) => {
      expect(executor).toBe(client)
    })
    const { updatePaymentLinkStatus } = createPaymentStateService({
      pool,
      settleSuccessfulCollection,
      queueSuccessfulTransaction,
      queueTransactionWebhook,
    })

    await expect(
      updatePaymentLinkStatus("payment-1", "EXECUTED"),
    ).resolves.toBe(true)

    expect(calls.map(({ sql }) => sql)).toEqual([
      "BEGIN",
      "SELECT status FROM payment_links WHERE id = $1 FOR UPDATE",
      "UPDATE payment_links SET status = 'EXECUTED', updated_at = NOW() WHERE id = $1",
      "COMMIT",
    ])
    expect(settleSuccessfulCollection).toHaveBeenCalledOnce()
    expect(queueSuccessfulTransaction).toHaveBeenCalledOnce()
    expect(queueTransactionWebhook).toHaveBeenCalledOnce()
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("rolls back a failed settlement, records retry state, and allows re-entry", async () => {
    const { client, calls, getStatus } = createTransactionClient()
    const pool = { connect: vi.fn(async () => client) }
    const settleSuccessfulCollection = vi
      .fn()
      .mockRejectedValueOnce(new Error("ledger unavailable"))
      .mockResolvedValueOnce(undefined)
    const queueSuccessfulTransaction = vi.fn()
    const queueTransactionWebhook = vi.fn()
    const { updatePaymentLinkStatus } = createPaymentStateService({
      pool,
      settleSuccessfulCollection,
      queueSuccessfulTransaction,
      queueTransactionWebhook,
    })

    await expect(
      updatePaymentLinkStatus("payment-1", "EXECUTED"),
    ).rejects.toThrow("ledger unavailable")
    expect(getStatus()).toBe("SETTLEMENT_RETRY")
    expect(queueSuccessfulTransaction).not.toHaveBeenCalled()
    expect(queueTransactionWebhook).not.toHaveBeenCalled()

    await expect(
      updatePaymentLinkStatus("payment-1", "EXECUTED"),
    ).resolves.toBe(true)
    expect(getStatus()).toBe("EXECUTED")
    expect(settleSuccessfulCollection).toHaveBeenCalledTimes(2)
    expect(queueSuccessfulTransaction).toHaveBeenCalledOnce()
    expect(queueTransactionWebhook).toHaveBeenCalledOnce()
    expect(calls.map(({ sql }) => sql)).toContain("ROLLBACK")
    expect(calls.map(({ sql }) => sql)).toContain(
      "UPDATE payment_links SET status = 'SETTLEMENT_RETRY', updated_at = NOW()\n" +
        "             WHERE id = $1\n" +
        "               AND status IN ('CREATING', 'ACTIVE', 'PENDING', 'OUTCOME_UNKNOWN', 'SETTLEMENT_RETRY')",
    )
    expect(client.release).toHaveBeenCalledTimes(2)
  })

  it("rolls back settlement when webhook outbox insertion fails", async () => {
    const { client, calls, getStatus } = createTransactionClient()
    const pool = { connect: vi.fn(async () => client) }
    const settleSuccessfulCollection = vi.fn()
    const queueSuccessfulTransaction = vi.fn()
    const queueTransactionWebhook = vi
      .fn()
      .mockRejectedValueOnce(new Error("webhook outbox unavailable"))
      .mockResolvedValueOnce(undefined)
    const { updatePaymentLinkStatus } = createPaymentStateService({
      pool,
      settleSuccessfulCollection,
      queueSuccessfulTransaction,
      queueTransactionWebhook,
    })

    await expect(
      updatePaymentLinkStatus("payment-1", "EXECUTED"),
    ).rejects.toThrow("webhook outbox unavailable")
    expect(getStatus()).toBe("SETTLEMENT_RETRY")
    expect(calls.map(({ sql }) => sql)).toContain("ROLLBACK")

    await expect(
      updatePaymentLinkStatus("payment-1", "EXECUTED"),
    ).resolves.toBe(true)
    expect(getStatus()).toBe("EXECUTED")
    expect(settleSuccessfulCollection).toHaveBeenCalledTimes(2)
    expect(queueSuccessfulTransaction).toHaveBeenCalledTimes(2)
    expect(queueTransactionWebhook).toHaveBeenCalledTimes(2)
  })

  it("repairs an already executed payment idempotently", async () => {
    const { client, getStatus } = createTransactionClient("EXECUTED")
    const pool = { connect: vi.fn(async () => client) }
    const settleSuccessfulCollection = vi.fn()
    const queueSuccessfulTransaction = vi.fn()
    const queueTransactionWebhook = vi.fn()
    const { updatePaymentLinkStatus } = createPaymentStateService({
      pool,
      settleSuccessfulCollection,
      queueSuccessfulTransaction,
      queueTransactionWebhook,
    })

    await expect(
      updatePaymentLinkStatus("payment-1", "EXECUTED"),
    ).resolves.toBe(true)

    expect(getStatus()).toBe("EXECUTED")
    expect(settleSuccessfulCollection).toHaveBeenCalledOnce()
    expect(queueSuccessfulTransaction).toHaveBeenCalledOnce()
    expect(queueTransactionWebhook).toHaveBeenCalledOnce()
    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("SET status = 'EXECUTED'"),
      ),
    ).toBe(false)
  })
})
