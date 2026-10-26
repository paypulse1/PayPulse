import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateMerchantAvailableBalance,
  getMerchantWalletState,
} from "./wallet-ledger.js"

test("available merchant balance subtracts pending reservations", () => {
  assert.equal(calculateMerchantAvailableBalance("100.00", "25.00"), 75)
  assert.equal(calculateMerchantAvailableBalance("10.00", "12.00"), -2)
})

test("available merchant balance rejects invalid totals", () => {
  assert.throws(() => calculateMerchantAvailableBalance("bad", 0), /totals are invalid/)
  assert.throws(() => calculateMerchantAvailableBalance(100, -1), /totals are invalid/)
})

test("wallet totals are always scoped to the authenticated merchant", async () => {
  const db = {
    query: async (sql, parameters) => {
      assert.match(sql, /FROM merchant_wallet_ledger/)
      assert.match(sql, /FROM disbursements d/)
      assert.match(sql, /d\.status NOT IN/)
      assert.match(sql, /p\.merchant_email = d\.merchant_email/)
      assert.match(sql, /WHERE d\.merchant_email = \$1/)
      assert.equal((sql.match(/WHERE merchant_email = \$1/g) || []).length, 2)
      assert.deepEqual(parameters, ["merchant@example.com"])
      return {
        rows: [{
          balance: 100,
          collection_credits: 125,
          completed_krw: 2000,
          reserved: 25,
        }],
      }
    },
  }
  assert.deepEqual(await getMerchantWalletState(db, "merchant@example.com"), {
    balance: 100,
    collection_credits: 125,
    completed_krw: 2000,
    reserved: 25,
  })
})
