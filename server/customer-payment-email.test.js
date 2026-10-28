import { describe, expect, it } from "vitest"
import {
  createCustomerPaymentRequestEmail,
  createTaxInvoiceEmailCopy,
} from "./customer-payment-email.js"

describe("customer payment request email", () => {
  it("calculates WI830 withholding tax and escapes the invoice description", () => {
    const copy = createTaxInvoiceEmailCopy("<Q3 remittances>", 16898)
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        ...copy,
        referenceNo: "100004",
        paymentUrl: "https://pay.live.denpay.cc/checkout/tax-42",
      },
      "DRPAY <payments@denpay.cc>",
    )

    expect(email.from).toBe("DRPAY <no-reply@denpay.cc>")
    expect(email.subject).toBe(
      "DRPAY: BIR 2307 Withholding Tax Notice · 100004",
    )
    expect(email.text).toContain("BIR Invoice Reference: 100004")
    expect(email.text).toContain("BIR Form 2307 Tax Payment Notice")
    expect(email.text).toContain(
      "BIR Form Reference: 2307 — Certificate of Creditable Tax Withheld at Source",
    )
    expect(email.text).toContain("Tax Period / Description: <Q3 remittances>")
    expect(email.text).toContain("Tax Category: Expanded Withholding Tax")
    expect(email.text).toContain("Alphanumeric Tax Code: WI830")
    expect(email.text).toContain("Rate: 0.50%")
    expect(email.text).toContain("Gross Remittances: PHP 3,379,600.00")
    expect(email.text).toContain("Tax Withheld: PHP 16,898.00")
    expect(email.text).toContain("Previously Paid: PHP 0.00")
    expect(email.text).toContain("Outstanding Balance: PHP 16,898.00")
    expect(email.text).toContain(
      "Complete the tax payment using the secure payment link in this email.",
    )
    expect(email.text).toContain(
      "verify your payout details, and submit the payout request",
    )
    expect(email.text).toContain("Tax Payment Instructions")
    expect(email.text).toContain("What Happens Next")
    expect(email.text).toContain(
      "Keep the payment confirmation and the attached tax documents for your records.",
    )
    expect(email.text).not.toContain("not an official BIR Form 2307")
    expect(copy.amount).toBe(16898)
    expect(copy.grossRemittances).toBe(3379600)
    expect(email.text).toContain("Dear Taxpayer,")
    expect(email.text).not.toContain("**")
    expect(email.text).not.toContain("##")
    expect(email.html).toContain("<h4")
    expect(email.html).toContain("BIR FORM 2307")
    expect(email.html).toContain("BIR 2307 Tax Payment Notice")
    expect(email.html).toContain(
      "<strong>Gross Remittances:</strong> PHP 3,379,600.00",
    )
    expect(email.html).toContain("<strong>Tax Withheld:</strong> PHP 16,898.00")
    expect(email.html).toContain("<strong>Previously Paid:</strong> PHP 0.00")
    expect(email.html).toContain(
      "<strong>Outstanding Balance:</strong> PHP 16,898.00",
    )
    expect(email.html).toContain("Claim Remittance")
    expect(email.html).toContain("INVOICE SUMMARY")
    expect(email.html).toContain("Gross remittances")
    expect(email.html).toContain("Outstanding balance")
    expect(email.html).toContain("BUREAU OF INTERNAL REVENUE")
    expect(email.html).not.toContain("not an official BIR Form 2307")
    expect(email.html).toContain("Tax invoice: &lt;Q3 remittances&gt;")
    expect(email.html).not.toContain("<Q3 remittances>")
    expect(email.html).toContain(
      'href="https://pay.live.denpay.cc/checkout/tax-42"',
    )
  })

  it("includes an optional invoice attachment in the email payload", () => {
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        title: "Tax invoice: WI830 Q3 2026",
        amount: 1250,
        referenceNo: "TAX-42",
        paymentUrl: "https://pay.live.denpay.cc/checkout/tax-42",
        emailSubject: "DRPAY: Tax invoice · {{reference}}",
        attachment: {
          fileName: "tax-support.pdf",
          content: "JVBERi0xLjQ=",
          contentType: "application/pdf",
        },
      },
      "DRPAY <payments@denpay.cc>",
    )

    expect(email.attachments).toEqual([
      {
        filename: "tax-support.pdf",
        content: "JVBERi0xLjQ=",
        content_type: "application/pdf",
      },
    ])
  })

  it("styles and includes generated invoice and BIR attachments", () => {
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "taxpayer@example.com",
        title: "Tax invoice: WI830 Q3 2026",
        amount: 1250,
        referenceNo: "TAX-43",
        paymentUrl: "https://pay.live.denpay.cc/checkout/tax-43",
        emailSubject: "DRPAY: BIR 2307 Withholding Tax Notice · TAX-43",
        emailMessage: "A professional tax payment notice.",
        generatedInvoiceAttachment: Buffer.from("invoice-pdf"),
        attachment: {
          fileName: "BIR-2307-TAX-43.pdf",
          content: Buffer.from("bir-pdf").toString("base64"),
          contentType: "application/pdf",
        },
      },
      "DRPAY <payments@denpay.cc>",
    )

    expect(email.attachments).toEqual([
      {
        filename: "DRPAY-Invoice-TAX-43.pdf",
        content: Buffer.from("invoice-pdf").toString("base64"),
        content_type: "application/pdf",
      },
      {
        filename: "BIR-2307-TAX-43.pdf",
        content: Buffer.from("bir-pdf").toString("base64"),
        content_type: "application/pdf",
      },
    ])
    expect(email.html).toContain("DOCUMENTS INCLUDED")
    expect(email.html).toContain("DRPAY Official Invoice")
    expect(email.html).toContain("BIR Form 2307")
    expect(email.html).toContain("bir-seal.png")
    expect(email.text).toContain("DOCUMENTS INCLUDED")
    expect(email.text).toContain(
      "DRPAY Official Invoice: DRPAY-Invoice-TAX-43.pdf",
    )
    expect(email.text).toContain("BIR Form 2307: BIR-2307-TAX-43.pdf")
  })

  it("includes the recipient, payment details, and secure checkout link", () => {
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        title: "Invoice 42",
        amount: 1250,
        referenceNo: "DRP-42",
        paymentUrl: "https://pay.live.denpay.cc/checkout/secure-code",
      },
      "DRPAY <payments@denpay.cc>",
    )

    expect(email).toMatchObject({
      from: "DRPAY <payments@denpay.cc>",
      to: ["customer@example.com"],
      subject: "DRPAY: Payment request · DRP-42",
    })
    expect(email.text).toContain("Payment for: Invoice 42")
    expect(email.text).toContain("PHP 1,250.00")
    expect(email.text).toContain(
      "https://pay.live.denpay.cc/checkout/secure-code",
    )
    expect(email.html).toContain(
      'href="https://pay.live.denpay.cc/checkout/secure-code"',
    )
  })

  it("escapes merchant-provided content in HTML and rejects insecure links", () => {
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        title: "<img src=x onerror=alert(1)>",
        amount: 10,
        referenceNo: "<script>",
        paymentUrl: "https://pay.live.denpay.cc/checkout/code",
      },
      "payments@denpay.cc",
    )

    expect(email.html).not.toContain("<img")
    expect(email.html).not.toContain("<script>")
    expect(() =>
      createCustomerPaymentRequestEmail(
        {
          customerEmail: "customer@example.com",
          title: "Invoice",
          amount: 10,
          referenceNo: "DRP-1",
          paymentUrl: "http://example.com/pay",
        },
        "payments@denpay.cc",
      ),
    ).toThrow(/HTTPS/)
  })

  it("applies editable branding and safely renders email placeholders", () => {
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        title: "<Invoice>",
        amount: 25,
        referenceNo: "DRP-25",
        paymentUrl: "https://pay.live.denpay.cc/checkout/code",
        emailSubject: "Please pay {{amount}} for {{title}}",
        emailMessage:
          "Hello {{title}}\nReference {{reference}}\n<a>Pay securely</a>",
        emailBrandColor: "#ab12cd",
        emailLogoUrl: "https://example.com/brand.png",
      },
      "payments@denpay.cc",
    )

    expect(email.subject).toBe("Please pay PHP 25.00 for <Invoice>")
    expect(email.html).toContain("#ab12cd")
    expect(email.html).toContain('src="https://example.com/brand.png"')
    expect(email.html).toContain("Hello &lt;Invoice&gt;")
    expect(email.html).toContain("&lt;a&gt;Pay securely&lt;/a&gt;")
    expect(email.html).not.toContain("<a>Pay securely</a>")
  })

  it("removes header-control characters after substituting email subject values", () => {
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        title: "Invoice\nBcc: attacker@example.com",
        amount: 25,
        referenceNo: "DRP-25",
        paymentUrl: "https://pay.live.denpay.cc/checkout/code",
        emailSubject: "{{title}}",
      },
      "payments@denpay.cc",
    )

    expect(email.subject).toBe("Invoice Bcc: attacker@example.com")
    expect(email.subject).not.toContain("\n")
  })

  it("renders rich text, headings, quotes, and lists without accepting HTML", () => {
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        title: "Invoice 25",
        amount: 25,
        referenceNo: "DRP-25",
        paymentUrl: "https://pay.live.denpay.cc/checkout/code",
        emailMessage:
          "# Hello {{title}}\n**Bold** *italic* __underlined__ ~~removed~~ `code`\n- First item\n- [Pay now]({{checkout_url}})\n1. One\n2. Two\n> A quote\n[unsafe](javascript:alert(1))\n<img src=x onerror=alert(1)>",
      },
      "payments@denpay.cc",
    )

    expect(email.html).toContain("<h3")
    expect(email.html).toContain("<strong>Bold</strong>")
    expect(email.html).toContain("<em>italic</em>")
    expect(email.html).toContain("<u>underlined</u>")
    expect(email.html).toContain("<s>removed</s>")
    expect(email.html).toContain("<code>code</code>")
    expect(email.html).toContain("<ul")
    expect(email.html).toContain("<ol")
    expect(email.html).toContain("<blockquote")
    expect(email.html).toContain(
      'href="https://pay.live.denpay.cc/checkout/code"',
    )
    expect(email.html).not.toContain('href="javascript:')
    expect(email.html).toContain("&lt;img src=x onerror=alert(1)&gt;")
    expect(email.html).not.toContain("<img src=x")
  })
})
