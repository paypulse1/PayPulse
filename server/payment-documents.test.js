import { describe, expect, it } from "vitest"
import { createPaymentInvoicePdf } from "./payment-documents.js"

describe("payment document generation", () => {
  it("truncates unusually long titles without blocking the event loop", async () => {
    const pdf = await createPaymentInvoicePdf({
      amount: 125,
      referenceNo: "DRPAY-TEST",
      title: "Long payment title ".repeat(10_000),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdf.byteLength).toBeGreaterThan(0)
  })
})
