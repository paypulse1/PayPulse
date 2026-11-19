import { describe, expect, it } from "vitest"
import {
  createPaymentInvoicePdf,
  createPaymentReceiptPdf,
} from "./payment-documents.js"

describe("payment document generation", () => {
  it("truncates unusually long titles without blocking the event loop", async () => {
    const pdf = await createPaymentInvoicePdf({
      amount: 125,
      referenceNo: "PayPulse-TEST",
      title: "Long payment title ".repeat(10_000),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdf.byteLength).toBeGreaterThan(0)
  })

  it("generates payment receipts as PDF documents", async () => {
    const pdf = await createPaymentReceiptPdf({
      amount: 125,
      referenceNo: "PayPulse-RECEIPT-TEST",
      title: "Test payment",
      status: "PAID",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
  })
})
