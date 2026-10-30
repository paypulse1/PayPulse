import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { createMerchantAgreementPdf } from "./merchant-agreement.js"

describe("merchant agreement generation", () => {
  it("creates a multi-page signed agreement with the invited merchant and agreed terms", async () => {
    const pdfBytes = await createMerchantAgreementPdf({
      agreementId: "agreement-test-123",
      merchantEmail: "owner@example.com",
      businessName: "Example Trading Co.",
      contactPerson: "Alex Merchant",
      businessAddress: "123 Main Street, Manila",
      phoneNumber: "+63 900 000 0000",
      providerName: "DRPAY Services Ltd.",
      providerAddress: "100 Finance Street, Makati City",
      providerRegistrationNumber: "SEC-CS20260001",
      collectionFeePercent: 1.25,
      transferFeeFixed: 20,
      activationFee: 7500,
      createdAt: new Date("2026-10-30T00:00:00.000Z"),
    })

    expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-")
    expect(pdfBytes.toString("latin1")).toContain("/Subtype /Image")
    const pdf = await PDFDocument.load(pdfBytes)
    expect(pdf.getPageCount()).toBeGreaterThan(1)
    expect(pdf.getTitle()).toBe(
      "DRPAY Services Ltd. Merchant Services Agreement",
    )

    const parsedPdf = await pdfjs.getDocument({
      data: new Uint8Array(pdfBytes),
      useSystemFonts: true,
    }).promise
    const firstPage = await parsedPdf.getPage(1)
    const firstPageOperators = await firstPage.getOperatorList()
    expect(
      firstPageOperators.fnArray.filter(
        (operator) => operator === pdfjs.OPS.paintImageXObject,
      ),
    ).toHaveLength(2)
    const pageTexts = await Promise.all(
      Array.from({ length: parsedPdf.numPages }, async (_, index) => {
        const page = await parsedPdf.getPage(index + 1)
        const content = await page.getTextContent()
        return content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
      }),
    )
    const agreementText = pageTexts.join(" ")
    expect(agreementText).toContain("AGREEMENT FOR SIGNATURE")
    expect(agreementText).toContain("Example Trading Co.")
    expect(agreementText).toContain("1.25%")
    expect(agreementText).toContain("PHP 20.00")
    expect(agreementText).toContain("PHP 7,500.00")
    expect(agreementText).toContain("100 Finance Street, Makati City")
    expect(agreementText).toContain("SEC-CS20260001")
    expect(agreementText).toContain("Republic of Korea")
  })
})
