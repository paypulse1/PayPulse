import { describe, expect, it, vi } from "vitest"
import { postBalancedJournal } from "./accounting.js"

describe("balanced accounting journals", () => {
  it("rejects unbalanced entries before writing any rows", async () => {
    const executor = { query: vi.fn() }
    await expect(
      postBalancedJournal(executor, {
        sourceType: "COLLECTION",
        sourceId: "payment-1",
        reference: "PAY-1",
        lines: [
          { accountCode: "CLEARING", side: "debit", amount: "10.00" },
          { accountCode: "MERCHANT_PAYABLE", side: "credit", amount: "9.99" },
        ],
      }),
    ).rejects.toThrow("not balanced")
    expect(executor.query).not.toHaveBeenCalled()
  })

  it("writes exact-cent balanced lines and is safe on replay", async () => {
    const executor = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValue({ rowCount: 1, rows: [] }),
    }
    const journal = {
      sourceType: "COLLECTION",
      sourceId: "payment-1",
      reference: "PAY-1",
      lines: [
        { accountCode: "CLEARING", side: "debit", amount: "0.30" },
        { accountCode: "MERCHANT_PAYABLE", side: "credit", amount: "0.27" },
        { accountCode: "FEE_REVENUE", side: "credit", amount: "0.03" },
      ],
    }
    const firstPost = await postBalancedJournal(executor, journal)
    expect(firstPost.created).toBe(true)
    expect(firstPost.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(
      executor.query.mock.calls.slice(1).map(([, values]) => values[5]),
    ).toEqual(["0.30", "0.27", "0.03"])
    expect(executor.query).toHaveBeenCalledTimes(4)
    executor.query.mockResolvedValueOnce({ rowCount: 0, rows: [] })
    expect(await postBalancedJournal(executor, journal)).toEqual({
      created: false,
      id: null,
    })
  })
})
