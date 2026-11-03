import { describe, expect, it } from "vitest"
import {
  isSupportedPaymentLinkCurrency,
  paymentLinkRequestFingerprint,
} from "./payment-link-idempotency.js"

const request = {
  amount: 125.5,
  collectionAmountKrw: null,
  description: "Invoice 1048",
  customerEmail: "customer@example.com",
  paymentInstitutionCode: null,
  paymentInstitutionName: null,
  paymentInstitutionLogoUrl: null,
  paymentInstitutionDeepLink: null,
  checkoutInstructions: "Scan the QR code.",
  emailSubject: "Payment request",
  emailMessage: "Please pay.",
  emailBrandColor: "#153e2c",
  emailLogoUrl: null,
}

describe("payment link idempotency fingerprint", () => {
  it("matches the same request after database numeric values are read back", () => {
    const stored = {
      ...request,
      amount: "125.50",
      collectionAmountKrw: null,
    }

    expect(paymentLinkRequestFingerprint(stored)).toBe(
      paymentLinkRequestFingerprint(request),
    )
  })

  it.each([
    ["amount", 126],
    ["collectionAmountKrw", 10000],
    ["description", "Different invoice"],
    ["customerEmail", "other@example.com"],
    ["paymentInstitutionCode", "BANK"],
    ["paymentInstitutionName", "Bank"],
    ["paymentInstitutionLogoUrl", "https://example.com/logo.png"],
    ["paymentInstitutionDeepLink", "bank://checkout"],
    ["checkoutInstructions", "Use a different scanner."],
    ["emailSubject", "Different subject"],
    ["emailMessage", "Different message"],
    ["emailBrandColor", "#000000"],
    ["emailLogoUrl", "https://example.com/brand.png"],
  ])("differs when %s changes", (field, value) => {
    expect(
      paymentLinkRequestFingerprint({ ...request, [field]: value }),
    ).not.toBe(paymentLinkRequestFingerprint(request))
  })
})

describe("payment link currency validation", () => {
  it("defaults an omitted currency to PHP and rejects unsupported currencies", () => {
    expect(isSupportedPaymentLinkCurrency(undefined)).toBe(true)
    expect(isSupportedPaymentLinkCurrency("PHP")).toBe(true)
    expect(isSupportedPaymentLinkCurrency("USD")).toBe(false)
    expect(isSupportedPaymentLinkCurrency("php")).toBe(false)
  })
})
