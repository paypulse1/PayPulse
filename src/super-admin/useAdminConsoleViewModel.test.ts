import assert from "node:assert/strict"
import { test } from "vitest"
import type { AdminMerchantAccount } from "../lib/swiftpay"
import {
  canActivateMerchant,
  hasRequiredKybDocuments,
  updateMerchantKybStatus,
} from "./useAdminConsoleViewModel"

const documents = (documentTypes: string[]) =>
  documentTypes.map((documentType, index) => ({
    id: String(index),
    documentType,
    fileName: `${documentType}.pdf`,
    contentType: "application/pdf",
    sizeBytes: 1,
    uploadedAt: "",
  }))

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

test("KYB approval requires each required document type", () => {
  assert.equal(
    hasRequiredKybDocuments({
      documents: documents([
        "business_registration",
        "identity_front",
        "identity_back",
        "proof_of_address",
      ]),
    }),
    true,
  )
  assert.equal(
    hasRequiredKybDocuments({
      documents: documents([
        "business_registration",
        "identity_front",
        "proof_of_address",
      ]),
    }),
    false,
  )
})
