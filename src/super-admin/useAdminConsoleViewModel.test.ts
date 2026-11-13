import assert from "node:assert/strict"
import { test } from "vitest"
import type { AdminMerchantAccount } from "../lib/swiftpay"
import {
  canActivateMerchant,
  canManuallyApproveKyb,
  updateMerchantKybStatus,
} from "./useAdminConsoleViewModel"

const merchant = (overrides: Partial<AdminMerchantAccount> = {}) =>
  ({
    email: "merchant@example.com",
    active: false,
    registrationPending: true,
    businessName: "Example",
    contactPerson: "Owner",
    phoneNumber: "+63912345678",
    businessAddress: "Manila",
    bankName: "Bank",
    accountName: "Example",
    accountNumber: "12345678",
    usdtAddress: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  }) satisfies AdminMerchantAccount

test("pending registration activation requires approved KYB", () => {
  assert.equal(canActivateMerchant(merchant({ kybStatus: "PENDING" })), false)
  assert.equal(canActivateMerchant(merchant({ kybStatus: "APPROVED" })), true)
  assert.equal(
    canActivateMerchant(
      merchant({ registrationPending: false, kybStatus: "PENDING" }),
    ),
    true,
  )
})

test("approving KYB updates the merchant row so registration can be activated", () => {
  const pendingMerchant = merchant({ kybStatus: "PENDING" })
  const [updatedMerchant] = updateMerchantKybStatus(
    [pendingMerchant],
    pendingMerchant.email,
    "APPROVED",
  )

  assert.equal(updatedMerchant.kybStatus, "APPROVED")
  assert.equal(canActivateMerchant(updatedMerchant), true)
})

test("manual KYB approval requires consent, business registration, and both ID sides", () => {
  assert.equal(
    canManuallyApproveKyb({
      kybConsentGiven: true,
      documents: [
        { documentType: "business_registration" },
        { documentType: "identity_front" },
        { documentType: "identity_back" },
      ],
    }),
    true,
  )
  assert.equal(
    canManuallyApproveKyb({
      kybConsentGiven: true,
      documents: [
        { documentType: "business_registration" },
        { documentType: "identity_front" },
      ],
    }),
    false,
  )
  assert.equal(
    canManuallyApproveKyb({
      kybConsentGiven: false,
      documents: [
        { documentType: "business_registration" },
        { documentType: "identity_front" },
        { documentType: "identity_back" },
      ],
    }),
    false,
  )
})
