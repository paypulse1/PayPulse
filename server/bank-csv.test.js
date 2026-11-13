import { describe, expect, it } from "vitest"
import { parseBankCsv } from "./bank-csv.js"

describe("bank statement CSV parsing", () => {
  it("parses quoted references and normalizes exact PHP amounts", () => {
    expect(
      parseBankCsv(
        'reference,amount,currency,direction,status,occurred_at\r\n"REF, 1",10.20,php,in,posted,2025-01-02T03:04:05Z\r\n',
      ),
    ).toEqual([
      {
        reference: "REF, 1",
        amount: "10.20",
        currency: "PHP",
        direction: "IN",
        status: "posted",
        occurredAt: "2025-01-02T03:04:05.000Z",
      },
    ])
  })

  it("rejects malformed, over-precision, and incomplete statements", () => {
    expect(() => parseBankCsv("reference,amount\nabc,1")).toThrow(
      "missing columns",
    )
    expect(() =>
      parseBankCsv(
        "reference,amount,currency,direction,status,occurred_at\nabc,1.001,PHP,IN,posted,2025-01-01",
      ),
    ).toThrow()
    expect(() =>
      parseBankCsv(
        'reference,amount,currency,direction,status,occurred_at\n"abc,1,PHP,IN,posted,2025-01-01',
      ),
    ).toThrow("unclosed")
  })
})
