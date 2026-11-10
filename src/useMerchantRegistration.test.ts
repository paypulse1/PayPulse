import assert from "node:assert/strict"
import { test } from "vitest"
import { normalizeReferralCode } from "./useMerchantRegistration"

test("referral codes are trimmed and normalized to uppercase", () => {
  assert.equal(normalizeReferralCode("  a1b2c3d4e5f6g7h8 "), "A1B2C3D4E5F6G7H8")
  assert.equal(normalizeReferralCode("   "), "")
})
