import { describe, expect, it, vi } from "vitest"
import { verifyPinWithAttemptLimit } from "./pin-attempts.js"

function createPool(attemptCount) {
  const calls = []
  const client = {
    query: vi.fn(async (sql) => {
      calls.push(sql)
      if (sql.includes("SELECT pin_salt, pin_hash")) {
        return {
          rows: [{ pin_salt: "salt", pin_hash: "hash" }],
          rowCount: 1,
        }
      }
      if (sql.includes("SELECT COUNT(*)")) {
        return { rows: [{ count: attemptCount }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    }),
    release: vi.fn(),
  }
  return {
    calls,
    pool: { connect: vi.fn(async () => client) },
    client,
  }
}

describe("serialized MPIN attempt accounting", () => {
  it("locks the security row before checking and recording an invalid attempt", async () => {
    const { pool, client, calls } = createPool(4)
    const result = await verifyPinWithAttemptLimit(
      pool,
      "merchant@example.com",
      "1234",
      () => false,
    )

    expect(result).toMatchObject({ status: 403, reason: "invalid" })
    expect(calls[1]).toContain("FOR UPDATE")
    expect(calls[3]).toContain("COUNT(*)")
    expect(calls[4]).toContain("INSERT INTO merchant_pin_attempts")
    expect(calls.at(-1)).toBe("COMMIT")
    expect(client.release).toHaveBeenCalledOnce()
  })

  it("rejects attempts at the limit without adding more failures", async () => {
    const { pool, calls } = createPool(5)
    const result = await verifyPinWithAttemptLimit(
      pool,
      "merchant@example.com",
      "1234",
      () => false,
    )

    expect(result).toMatchObject({ status: 429, reason: "rate_limited" })
    expect(calls).not.toContain(
      "INSERT INTO merchant_pin_attempts (merchant_email) VALUES ($1)",
    )
  })
})
