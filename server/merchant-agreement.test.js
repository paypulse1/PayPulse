import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { createAlipayPlusAgreementPdf } from "./alipay-plus-agreement.js"
import { createMerchantAgreementPdf } from "./merchant-agreement.js"
import { createMerchantOnboardingGuidePdf } from "./merchant-onboarding-guide.js"

describe("merchant agreement generation", () => {
  it("creates a formal Alipay+ agreement with the provider role and signature blocks", async () => {
    const pdfBytes = await createAlipayPlusAgreementPdf({
      agreementId: "alipay-test-123",
      merchantName: "Example Trading Co.",
      merchantEmail: "owner@example.com",
      merchantAddress: "123 Main Street, Manila",
      contactPerson: "Alex Merchant",
      phoneNumber: "+63 900 000 0000",
      providerName: "DRPAY Services Ltd.",
      providerAddress: "100 Finance Street, Makati City",
      providerRegistrationNumber: "SEC-CS20260001",
      templateVersion: "2026-03-v2-confidentiality",
      createdAt: new Date("2026-10-30T00:00:00.000Z"),
    })
    const pdf = await PDFDocument.load(pdfBytes)
    const parsedPdf = await pdfjs.getDocument({
      data: new Uint8Array(pdfBytes),
      useSystemFonts: true,
    }).promise
    const page = await parsedPdf.getPage(1)
    const [content, operators] = await Promise.all([
      page.getTextContent(),
      page.getOperatorList(),
    ])
    const agreementText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")

    expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-")
    expect(pdf.getTitle()).toBe(
      "Alipay+ International Payment Services Agreement",
    )
    expect(pdf.getPageCount()).toBe(1)
    expect(agreementText).toContain(
      "ALIPAY+ INTERNATIONAL PAYMENT SERVICES AGREEMENT",
    )
    expect(agreementText).toContain("Alipay+ is the designated provider")
    expect(agreementText).toContain(
      "international collection and outbound transfer",
    )
    expect(agreementText).toContain("Example Trading Co.")
    expect(agreementText).toContain("SEC-CS20260001")
    expect(agreementText).toContain("123 Main Street, Manila")
    expect(agreementText).toContain("2026-03-v2-confidentiality")
    expect(agreementText).toContain("Authorized representative")
    expect(agreementText).not.toContain("fee")
    expect(
      operators.fnArray.filter(
        (operator) => operator === pdfjs.OPS.constructPath,
      ).length,
    ).toBeGreaterThan(15)
  })

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
      templateVersion: "2026-03-v2-confidentiality",
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
    expect(agreementText).toContain("CONFIDENTIAL FEE SCHEDULE")
    expect(agreementText).toContain("CONFIDENTIAL")
    expect(agreementText).toContain("Example Trading Co.")
    expect(agreementText).toContain("1.25%")
    expect(agreementText).toContain("PHP 20.00")
    expect(agreementText).toContain("PHP 7,500.00")
    expect(agreementText).toContain("Service activation requirements")
    expect(agreementText).toContain("credited to the Super Admin fee wallet")
    expect(agreementText).toContain("at least 100 USDT")
    expect(agreementText).toContain("balance recorded when the assigned")
    expect(agreementText).toContain("v2026-03-v2-confidentiality")
    expect(agreementText).toContain("STRICT CONFIDENTIALITY, NON-DISCLOSURE")
    expect(agreementText).toContain("strict confidence")
    expect(agreementText).toContain("irreparable harm")
    expect(agreementText).toContain("100 Finance Street, Makati City")
    expect(agreementText).toContain("SEC-CS20260001")
    expect(agreementText).toContain("Republic of Korea")
  })

  it("creates a branded KRW and USDT guide with an invitation-time rate", async () => {
    const pdfBytes = await createMerchantOnboardingGuidePdf({
      merchantName: "Example Trading Co.",
      providerName: "DRPAY Services Ltd.",
      rate: 0.02617,
      rateSource: "DRPAY configured rate",
      rateUpdatedAt: new Date("2026-10-30T00:00:00.000Z"),
      capturedAt: new Date("2026-10-30T01:00:00.000Z"),
    })
    expect(pdfBytes.toString("latin1")).toContain("/Subtype /Image")
    const pdf = await PDFDocument.load(pdfBytes)
    const parsedPdf = await pdfjs.getDocument({
      data: new Uint8Array(pdfBytes),
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
    const guideText = pages.join(" ")

    expect(pdf.getTitle()).toBe(
      "DRPAY Services Ltd. Merchant Currency and USDT Guide",
    )
    expect(pdf.getPageCount()).toBe(2)
    expect(guideText).toContain("Example Trading Co.")
    expect(guideText).toContain("1 KRW = PHP 0.02617")
    expect(guideText).toContain("DRPAY configured rate")
    expect(guideText).toContain(
      "captured when this guide was prepared on Oct 30, 2026, 1:00 AM UTC",
    )
    expect(guideText).toContain("Checkout and merchant settlement are in PHP")
    expect(guideText).toContain("TRON mainnet address")
    expect(guideText).toContain("TRC20 network")
    expect(guideText).toContain(
      "The sending wallet or provider sets and displays the network transaction fee",
    )
    expect(guideText).toContain(
      "DRPAY does not set a fixed USDT network-fee amount",
    )
    expect(guideText).toContain("CONFIDENTIAL")
  })

  it("rejects an invalid KRW quote for the merchant guide", async () => {
    await expect(
      createMerchantOnboardingGuidePdf({
        merchantName: "Example Trading Co.",
        rate: 0,
        rateSource: "DRPAY configured rate",
        rateUpdatedAt: new Date("2026-10-30T00:00:00.000Z"),
      }),
    ).rejects.toThrow("A valid KRW/PHP quote is required")
  })
})
