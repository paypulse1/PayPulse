import { describe, expect, it, vi } from "vitest"
import {
  calculateCollectionFee,
  calculateRefundLedgerReversal,
  calculateTransferDebit,
  calculateTransferRequestAvailableBalance,
  createLedgerService,
} from "./ledger.js"
import { createFloatingTransferRequest } from "./floating-transfers.js"
import {
  hasApiKeyPermission,
  isMerchantSession,
  isOperationsSession,
} from "./access.js"
import {
  canManuallyConfirmPayment,
  createPaymentStateService,
} from "./payment-state.js"

function createClient(respond) {
  const calls = []
  const client = {
    query: vi.fn(async (sql, parameters = []) => {
      calls.push({ sql, parameters })
      return respond(sql, parameters)
    }),
    release: vi.fn(),
  }
  return { client, calls }
}

describe("ledger calculations", () => {
  it("calculates collection fees to whole cents", () => {
    expect(calculateCollectionFee("123.45", "2.5")).toBe(3.09)
  })

  it("rejects invalid collection fee configuration", () => {
    expect(() => calculateCollectionFee(100, 101)).toThrow(
      /fee percentage is invalid/,
    )
    expect(() => calculateCollectionFee(Number.NaN, 2)).toThrow(
      /collection amount is invalid/,
    )
  })

  it("reverses only the net collection amount on refunds", () => {
    expect(calculateRefundLedgerReversal("100.00", "2.50")).toBe(97.5)
    expect(() => calculateRefundLedgerReversal(10, 11)).toThrow(
      /refund ledger amount is invalid/,
    )
  })

  it("includes the fixed fee in a transfer debit", () => {
    expect(calculateTransferDebit("123.45", "2.50")).toBe(125.95)
    expect(() => calculateTransferDebit(0, 2)).toThrow(
      /transfer amount is invalid/,
    )
    expect(() => calculateTransferDebit(100, -1)).toThrow(
      /transfer fee is invalid/,
    )
  })

  it("subtracts pending reservations and validates totals", () => {
    expect(calculateTransferRequestAvailableBalance("100.00", "25.00")).toBe(75)
    expect(() => calculateTransferRequestAvailableBalance(100, -1)).toThrow(
      /totals are invalid/,
    )
  })
})

describe("collection settlement", () => {
  it("credits net funds and posts the platform fee atomically for manual confirmations", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM payment_links")) {
        return {
          rows: [
            {
              id: "payment-1",
              merchant_email: "merchant@example.com",
              reference_no: "DRP-1",
              amount: "123.45",
              status: "MANUALLY_PAID",
            },
          ],
        }
      }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "2.5" }] }
      if (sql.includes("SELECT amount FROM platform_fee_ledger"))
        return { rows: [{ amount: "3.09" }] }
      return { rows: [] }
    })
    const pool = { connect: vi.fn(async () => client) }
    const service = createLedgerService({
      pool,
      queueSuccessfulTransaction: vi.fn(),
      queueTransactionWebhook: vi.fn(),
    })

    await service.settleSuccessfulCollection("payment-1")

    const feeInsert = calls.find(({ sql }) =>
      sql.includes("INSERT INTO platform_fee_ledger"),
    )
    const creditInsert = calls.find(({ sql }) =>
      sql.includes("INSERT INTO merchant_wallet_ledger"),
    )
    expect(feeInsert.parameters[3]).toBe("3.09")
    expect(creditInsert.parameters[3]).toBe("120.36")
    expect(feeInsert.sql).toContain(
      "ON CONFLICT (source_type, source_id) DO NOTHING",
    )
    expect(creditInsert.sql).toContain(
      "ON CONFLICT (source_type, source_id) DO NOTHING",
    )
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("leaves an outer transaction in control when an existing client is provided", async () => {
    const { client, calls } = createClient(() => ({ rows: [] }))
    const service = createLedgerService({ pool: { connect: vi.fn() } })

    await service.settleSuccessfulCollection("missing", client)

    expect(calls.map(({ sql }) => sql)).not.toContain("BEGIN")
    expect(calls.map(({ sql }) => sql)).not.toContain("COMMIT")
    expect(client.release).not.toHaveBeenCalled()
  })

  it("rolls back invalid fees instead of partially settling", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM payment_links")) {
        return {
          rows: [
            {
              id: "payment-1",
              merchant_email: "merchant@example.com",
              amount: "100",
              status: "EXECUTED",
            },
          ],
        }
      }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "not-a-rate" }] }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
    })

    await expect(
      service.settleSuccessfulCollection("payment-1"),
    ).rejects.toThrow(/fee percentage is invalid/)

    expect(calls.map(({ sql }) => sql)).toContain("ROLLBACK")
    expect(
      calls.some(({ sql }) => sql.includes("INSERT INTO platform_fee_ledger")),
    ).toBe(false)
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("reverses the net collection ledger amount for a successful refund", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("UPDATE disbursements")) {
        return {
          rows: [
            {
              refund_payment_id: "payment-1",
              merchant_email: "merchant@example.com",
              amount: "100",
              transfer_fee: "0",
              merchant_reference_no: "REF-1",
            },
          ],
        }
      }
      if (sql.includes("SELECT GREATEST")) return { rows: [{ amount: "97.5" }] }
      if (sql.includes("FOR UPDATE OF d")) {
        return {
          rows: [
            {
              reference_no: "DRP-1",
              amount: "100",
              fee_amount: "2.5",
              merchant_reference_no: "REF-1",
              refund_ledger_reversed_at: null,
            },
          ],
        }
      }
      return { rows: [] }
    })
    const queueSuccessfulTransaction = vi.fn()
    const queueTransactionWebhook = vi.fn()
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction,
      queueTransactionWebhook,
    })

    await service.updateDisbursementStatus("transfer-1", null, "SUCCESS", null)

    const reversal = calls.find(({ sql }) =>
      sql.includes("INSERT INTO merchant_wallet_ledger"),
    )
    expect(reversal.parameters[3]).toBe("-97.50")
    expect(
      calls.some(({ sql }) => sql.includes("INSERT INTO platform_fee_ledger")),
    ).toBe(false)
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(queueSuccessfulTransaction).toHaveBeenCalledWith(
      "DISBURSEMENT",
      "transfer-1",
    )
    expect(queueTransactionWebhook).toHaveBeenCalledWith(
      "DISBURSEMENT",
      "transfer-1",
    )
  })

  it("does not debit the merchant ledger when a transfer fails", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("UPDATE disbursements")) {
        return {
          rows: [
            {
              refund_payment_id: null,
              merchant_email: "merchant@example.com",
              amount: "50",
              transfer_fee: "2.50",
              merchant_reference_no: "TRANSFER-1",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction: vi.fn(),
      queueTransactionWebhook: vi.fn(),
    })

    await service.updateDisbursementStatus(
      "transfer-1",
      null,
      "FAILED",
      "Provider rejected transfer",
    )

    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(
      calls.some(({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger"),
      ),
    ).toBe(false)
    expect(
      calls.some(({ sql }) => sql.includes("INSERT INTO platform_fee_ledger")),
    ).toBe(false)
  })

  it("debits and records transfer fees only after successful settlement", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("UPDATE disbursements")) {
        return {
          rows: [
            {
              refund_payment_id: null,
              merchant_email: "merchant@example.com",
              amount: "50",
              transfer_fee: "2.50",
              merchant_reference_no: "TRANSFER-1",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
      queueSuccessfulTransaction: vi.fn(),
      queueTransactionWebhook: vi.fn(),
    })

    await service.updateDisbursementStatus("transfer-1", null, "SUCCESS", null)

    const debit = calls.find(({ sql }) =>
      sql.includes("INSERT INTO merchant_wallet_ledger"),
    )
    const fee = calls.find(({ sql }) =>
      sql.includes("INSERT INTO platform_fee_ledger"),
    )
    expect(debit.parameters[3]).toBe("-52.50")
    expect(fee.parameters).toEqual([
      expect.any(String),
      "transfer-1",
      "merchant@example.com",
      "2.50",
    ])
    expect(fee.sql).toContain("'DISBURSEMENT'")
  })

  it("reserves the fixed fee on pending transfers but not refunds", async () => {
    const { client, calls } = createClient(() => ({ rows: [{}] }))
    const service = createLedgerService({ pool: { connect: async () => client } })

    await service.getMerchantWalletState(client, "merchant@example.com")

    const query = calls[0].sql
    expect(query).toContain("ELSE d.amount + d.transfer_fee")
    expect(query).toContain("WHEN d.refund_payment_id IS NOT NULL")
  })

  it("makes repeated collection settlement idempotent at the unique ledger keys", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("FROM payment_links")) {
        return {
          rows: [
            {
              id: "payment-1",
              merchant_email: "merchant@example.com",
              reference_no: "DRP-1",
              amount: "100",
              status: "EXECUTED",
            },
          ],
        }
      }
      if (sql.includes("FROM system_settings"))
        return { rows: [{ setting_value: "1" }] }
      if (sql.includes("SELECT amount FROM platform_fee_ledger"))
        return { rows: [{ amount: "1.00" }] }
      return { rows: [] }
    })
    const service = createLedgerService({
      pool: { connect: async () => client },
    })

    await service.settleSuccessfulCollection("payment-1")
    await service.settleSuccessfulCollection("payment-1")

    expect(
      calls.filter(({ sql }) =>
        sql.includes("INSERT INTO platform_fee_ledger"),
      ),
    ).toHaveLength(2)
    expect(
      calls.filter(({ sql }) =>
        sql.includes("INSERT INTO merchant_wallet_ledger"),
      ),
    ).toHaveLength(2)
    expect(
      calls.filter(({ sql }) =>
        sql.includes("ON CONFLICT (source_type, source_id) DO NOTHING"),
      ),
    ).toHaveLength(4)
  })
})

describe("floating transfer reservation", () => {
  it("locks the merchant before checking pending reservations and inserting a request", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("setting_key = 'transfer_fee_fixed'"))
        return { rows: [{ setting_value: "2" }] }
      if (sql.includes("FROM merchant_payout_accounts")) {
        return {
          rowCount: 1,
          rows: [
            {
              bankName: "Bank",
              accountName: "Merchant",
              accountNumber: "1234567890",
            },
          ],
        }
      }
      if (sql.includes("AS reserved"))
        return { rows: [{ balance: "100", reserved: "20" }] }
      if (sql.includes("INSERT INTO floating_transfer_requests")) {
        return {
          rows: [
            { id: "request-1", amount: 50, transferFee: 2, status: "PENDING" },
          ],
        }
      }
      return { rows: [] }
    })
    const pool = { connect: async () => client }

    const request = await createFloatingTransferRequest(
      pool,
      "merchant@example.com",
      50,
    )

    expect(request.status).toBe("PENDING")
    const lockIndex = calls.findIndex(
      ({ sql }) =>
        sql.includes("merchant_accounts") && sql.includes("FOR UPDATE"),
    )
    const reservationIndex = calls.findIndex(({ sql }) =>
      sql.includes("AS reserved"),
    )
    const insertIndex = calls.findIndex(({ sql }) =>
      sql.includes("INSERT INTO floating_transfer_requests"),
    )
    expect(lockIndex).toBeLessThan(reservationIndex)
    expect(reservationIndex).toBeLessThan(insertIndex)
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT")
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("rejects requests that exceed available funds including the fee", async () => {
    const { client, calls } = createClient((sql) => {
      if (sql.includes("setting_key = 'transfer_fee_fixed'"))
        return { rows: [{ setting_value: "2" }] }
      if (sql.includes("FROM merchant_payout_accounts")) {
        return {
          rowCount: 1,
          rows: [
            {
              bankName: "Bank",
              accountName: "Merchant",
              accountNumber: "1234567890",
            },
          ],
        }
      }
      if (sql.includes("AS reserved"))
        return { rows: [{ balance: "100", reserved: "20" }] }
      return { rows: [] }
    })

    await expect(
      createFloatingTransferRequest(
        { connect: async () => client },
        "merchant@example.com",
        79,
      ),
    ).rejects.toMatchObject({ status: 400 })

    expect(calls.map(({ sql }) => sql)).toContain("ROLLBACK")
    expect(
      calls.some(({ sql }) =>
        sql.includes("INSERT INTO floating_transfer_requests"),
      ),
    ).toBe(false)
  })
})

describe("authorization boundaries", () => {
  it("allows manual confirmation only from pending state", () => {
    expect(canManuallyConfirmPayment("PENDING")).toBe(true)
    expect(canManuallyConfirmPayment("EXECUTED")).toBe(false)
    expect(canManuallyConfirmPayment("MANUALLY_PAID")).toBe(false)
  })

  it("prevents provider updates from overwriting manual confirmations", async () => {
    const pool = {
      query: vi.fn(async () => ({ rowCount: 0, rows: [] })),
    }
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
    ).resolves.toBe(false)

    expect(pool.query.mock.calls[0][0]).toContain("status <> 'MANUALLY_PAID'")
    expect(settleSuccessfulCollection).not.toHaveBeenCalled()
    expect(queueSuccessfulTransaction).not.toHaveBeenCalled()
    expect(queueTransactionWebhook).not.toHaveBeenCalled()
  })

  it("accepts only merchant-role sessions with an email subject", () => {
    expect(
      isMerchantSession({ sub: "merchant@example.com", role: "merchant" }),
    ).toBe(true)
    expect(
      isMerchantSession({ sub: "ops@example.com", role: "super_admin" }),
    ).toBe(false)
    expect(isMerchantSession({ sub: "", role: "merchant" })).toBe(false)
  })

  it("binds operations access to both the configured identity and role", () => {
    expect(
      isOperationsSession(
        { sub: "ops@example.com", role: "super_admin" },
        "ops@example.com",
      ),
    ).toBe(true)
    expect(
      isOperationsSession(
        { sub: "other@example.com", role: "super_admin" },
        "ops@example.com",
      ),
    ).toBe(false)
    expect(
      isOperationsSession(
        { sub: "ops@example.com", role: "merchant" },
        "ops@example.com",
      ),
    ).toBe(false)
  })

  it("restricts API keys to explicitly granted read paths and payment creation", () => {
    expect(hasApiKeyPermission("GET", "/wallet/balance", ["read"])).toBe(true)
    expect(hasApiKeyPermission("GET", "/crypto/usdt-wallet", ["read"])).toBe(
      true,
    )
    expect(hasApiKeyPermission("GET", "/crypto/usdt-deposits", ["read"])).toBe(
      true,
    )
    expect(hasApiKeyPermission("GET", "/kyb", ["read"])).toBe(false)
    expect(
      hasApiKeyPermission("POST", "/payment-links", ["payments:write"]),
    ).toBe(true)
    expect(
      hasApiKeyPermission("POST", "/disbursements", ["payments:write"]),
    ).toBe(false)
    expect(
      hasApiKeyPermission("GET", "/wallet/balance", ["payments:write"]),
    ).toBe(false)
  })
})
