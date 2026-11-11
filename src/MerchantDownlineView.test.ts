import assert from "node:assert/strict"
import { test } from "vitest"

import { parseCommissionRate } from "./MerchantDownlineView"

test("parseCommissionRate accepts valid rates and rejects invalid ones", () => {
  assert.deepEqual(parseCommissionRate("12.5"), {
    value: 12.5,
    error: "",
  })

  assert.deepEqual(parseCommissionRate("0"), {
    value: 0,
    error: "",
  })

  assert.deepEqual(parseCommissionRate(""), {
    value: Number.NaN,
    error: "Enter a rate from 0% to 20% with at most two decimals.",
  })

  assert.deepEqual(parseCommissionRate("21"), {
    value: Number.NaN,
    error: "Enter a rate from 0% to 20% with at most two decimals.",
  })
})
