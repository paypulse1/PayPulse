import { describe, expect, it } from "vitest"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { PDFDocument } from "pdf-lib"
import { createMerchantApiIntegrationGuidePdf } from "./merchant-api-integration-guide.js"

describe("merchant API integration guide PDF", () => {
  it("includes environment, merchant-created key instructions, and real payload examples", async () => {
    const bytes = await createMerchantApiIntegrationGuidePdf({
      merchantName: "Example Trading Co.",
      apiBaseUrl: "https://api.example.test",
      checkoutOrigin: "https://pay.example.test",
      paymentEnvironment: "sandbox",
    })
    const pdf = await PDFDocument.load(bytes)
    const parsedPdf = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    }).promise
    const pages = await Promise.all(
      Array.from({ length: parsedPdf.numPages }, async (_, index) => {
        const page = await parsedPdf.getPage(index + 1)
        const content = await page.getTextContent()
        return content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
      }),
    )
    const text = pages.join(" ")

    expect(pdf.getTitle()).toBe("PayPulse Merchant API Integration Guide")
    expect(pdf.getPageCount()).toBe(5)
    expect(bytes.toString("latin1")).toContain("/Subtype /Image")
    expect(text).toContain("Example Trading Co.")
    expect(text).toContain("SANDBOX")
    expect(text).toContain("https://api.example.test")
    expect(text).toContain("Profile > Developer hub > API access")
    expect(text).toContain("It is shown only once")
    expect(text).toContain("Authorization:")
    expect(text).toContain(["Be", "arer"].join(""))
    expect(text).toContain("payments:write")
    expect(text).toContain("Idempotency-Key")
    expect(text).toContain("Only PHP payment links are supported")
    expect(text).toContain("120 requests per minute")
    expect(text).toContain("20 requests per minute per client IP")
    expect(text).toContain('"amount": 125.50')
    expect(text).toContain("requestEmailStatus")
    expect(text).toContain("queued")
    expect(text).toContain("/checkout/opaque_checkout_code")
    expect(text).toContain("status")
    expect(text).toContain("EXECUTED")
    expect(text).toContain("Receive verified webhooks")
    expect(text).toContain("payment.succeeded")
    expect(text).toContain("DRPAY-Signature")
    expect(text).toContain("timingSafeEqual")
    expect(text).toContain("exact raw request-body bytes")
    expect(text).toContain("How webhook delivery works")
    expect(text).toContain("Delivery is at least once")
    expect(text).toContain("exponential backoff")
  })

  it("rejects insecure or invalid integration guide URLs", async () => {
    await expect(
      createMerchantApiIntegrationGuidePdf({
        merchantName: "Example Trading Co.",
        apiBaseUrl: "http://api.example.test",
        checkoutOrigin: "https://pay.example.test",
        paymentEnvironment: "production",
      }),
    ).rejects.toThrow("must use HTTPS")
  })
})
