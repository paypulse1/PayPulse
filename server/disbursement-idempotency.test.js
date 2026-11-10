import { describe, expect, it } from "vitest"
import { disbursementReplayMatches } from "./disbursement-idempotency.js"

const existingTransfer = {
  amount: "125.50",
  channel: "INSTAPAY",
  institution_code: "BANK",
  recipient_account_number: "1234567890",
  recipient_name: "Merchant Name",
  remarks: "Invoice 12",
  refund_payment_id: null,
}

const request = {
  amount: 125.5,
  channel: "INSTAPAY",
  institutionCode: "BANK",
  accountNumber: "1234567890",
  fullName: "Merchant Name",
  remarks: "Invoice 12",
  refundPaymentId: "",
}

describe("disbursement idempotency replay", () => {
  it("matches the stored transfer details", () => {
    expect(disbursementReplayMatches(existingTransfer, request)).toBe(true)
  })

  it.each([
    ["amount", { amount: 125.51 }],
    ["channel", { channel: "PESONET" }],
    ["institution", { institutionCode: "OTHER_BANK" }],
    ["account", { accountNumber: "0987654321" }],
    ["recipient", { fullName: "Another Recipient" }],
    ["remarks", { remarks: "Different invoice" }],
    ["refund target", { refundPaymentId: "payment-2" }],
  ])("rejects a replay with changed %s", (_field, changed) => {
    expect(
      disbursementReplayMatches(existingTransfer, { ...request, ...changed }),
    ).toBe(false)
  })
})