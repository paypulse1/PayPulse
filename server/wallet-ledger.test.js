import { describe, expect, it } from "vitest"
import {
  calculateMerchantAvailableBalance,
  getMerchantWalletState,
} from "./wallet-ledger.js"

describe("merchant wallet ledger", () => {
  it("subtracts pending reservations from the available balance", () => {
    expect(calculateMerchantAvailableBalance("100.00", "25.00")).toBe(75)
    expect(calculateMerchantAvailableBalance("10.00", "12.00")).toBe(-2)
  })

  it("rejects invalid wallet totals", () => {
    expect(() => calculateMerchantAvailableBalance("bad", 0)).toThrow(
      "Merchant wallet totals are invalid.",
    )
    expect(() => calculateMerchantAvailableBalance(100, -1)).toThrow(
      "Merchant wallet totals are invalid.",
    )
  })

  it("scopes wallet totals to the requested merchant", async () => {
    const db = {
      query: async (sql, parameters) => {
        expect(sql).toMatch(/FROM merchant_wallet_ledger/)
        expect(sql).toMatch(/FROM disbursements d/)
        expect(sql).toMatch(/d\.status NOT IN/)
        expect(sql).toMatch(/p\.merchant_email = d\.merchant_email/)
        expect(sql).toMatch(/WHERE d\.merchant_email = \$1/)
        expect(sql.match(/WHERE merchant_email = \$1/g)).toHaveLength(2)
        expect(parameters).toEqual(["merchant@example.com"])
        return {
          rows: [
            {
              balance: 100,
              collection_credits: 125,
              completed_krw: 2000,
              reserved: 25,
            },
          ],
        }
      },
    }

    await expect(
      getMerchantWalletState(db, "merchant@example.com"),
    ).resolves.toEqual({
      balance: 100,
      collection_credits: 125,
      completed_krw: 2000,
      reserved: 25,
    })
  })
})
