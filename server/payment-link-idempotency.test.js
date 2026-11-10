import { describe, expect, it } from "vitest"
import {
  isValidEstimatedDeliveryDate,
  isSupportedPaymentLinkCurrency,
  paymentLinkRequestFingerprint,
} from "./payment-link-idempotency.js"

const request = {
  amount: 125.5,
  collectionAmountKrw: null,
  description: "Invoice 1048",
  customerEmail: "customer@example.com",
  estimatedDeliveryDate: null,
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
    ["estimatedDeliveryDate", "2026-11-15"],
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

describe("estimated delivery date validation", () => {
  it("accepts valid ISO calendar dates and rejects malformed dates", () => {
    expect(isValidEstimatedDeliveryDate("2026-11-10", "2026-11-10")).toBe(true)
    expect(isValidEstimatedDeliveryDate("2026-02-29", "2026-01-01")).toBe(false)
    expect(isValidEstimatedDeliveryDate("2028-02-29", "2028-01-01")).toBe(true)
    expect(isValidEstimatedDeliveryDate("2024-02-29", "2024-01-01")).toBe(true)
    expect(isValidEstimatedDeliveryDate("2026-13-01", "2026-01-01")).toBe(false)
    expect(isValidEstimatedDeliveryDate("2026-1-01", "2026-01-01")).toBe(false)
    expect(isValidEstimatedDeliveryDate("", "2026-01-01")).toBe(false)
    expect(isValidEstimatedDeliveryDate("2026-11-09", "2026-11-10")).toBe(false)
  })
})
