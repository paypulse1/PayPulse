import { describe, expect, it, vi } from "vitest"
import { reserveTransactionReference } from "./transaction-reference.js"

describe("reserveTransactionReference", () => {
  it("reserves and returns a six-digit reference", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    }

    const reference = await reserveTransactionReference(client)

    expect(reference).toMatch(/^\d{6}$/)
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO transaction_references"),
      [reference],
    )
  })

  it("retries collisions until a unique reference is reserved", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 }),
    }

    const reference = await reserveTransactionReference(client)

    expect(reference).toMatch(/^\d{6}$/)
    expect(client.query).toHaveBeenCalledTimes(2)
  })

  it("reports an explicit error when it cannot reserve a unique reference", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rowCount: 0 }),
    }

    await expect(reserveTransactionReference(client)).rejects.toThrow(
      "Could not allocate a unique six-digit transaction reference.",
    )
    expect(client.query).toHaveBeenCalledTimes(100)
  })
})
