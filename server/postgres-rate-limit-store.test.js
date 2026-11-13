import { describe, expect, it, vi } from "vitest"
import { PostgresRateLimitStore } from "./postgres-rate-limit-store.js"

describe("PostgresRateLimitStore", () => {
  it("uses a namespace and a shared window counter", async () => {
    const pool = {
      query: vi.fn(async () => ({
        rows: [{ hits: 3, reset_time: "2026-11-13T09:00:00.000Z" }],
      })),
    }
    const store = new PostgresRateLimitStore(pool, "login")
    store.init({ windowMs: 900_000 })

    await expect(store.increment("203.0.113.8")).resolves.toEqual({
      totalHits: 3,
      resetTime: new Date("2026-11-13T09:00:00.000Z"),
    })
    expect(pool.query.mock.calls.at(-1)[0]).toContain(
      "ON CONFLICT (scope_key, window_start)",
    )
    expect(pool.query.mock.calls.at(-1)[1]).toEqual([
      "login:203.0.113.8",
      900_000,
    ])
  })

  it("scopes reset operations to a limiter namespace", async () => {
    const pool = { query: vi.fn(async () => ({ rowCount: 0, rows: [] })) }
    const store = new PostgresRateLimitStore(pool, "payments")

    await store.resetAll()

    expect(pool.query.mock.calls[0][1]).toEqual(["payments:"])
  })
})
