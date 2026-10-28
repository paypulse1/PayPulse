import { describe, expect, it } from "vitest"
import {
  createCustomerPaymentRequestEmail,
  createTaxInvoiceEmailCopy,
} from "./customer-payment-email.js"

describe("customer payment request email", () => {
  it("formats tax invoices and escapes their description", () => {
    const copy = createTaxInvoiceEmailCopy("<VAT settlement>")
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        ...copy,
        amount: 1250,
        referenceNo: "TAX-42",
        paymentUrl: "https://pay.live.denpay.cc/checkout/tax-42",
      },
      "DRPAY <payments@denpay.cc>",
    )

    expect(email.from).toBe("DRPAY <no-reply@denpay.cc>")
    expect(email.subject).toBe("DRPAY: Tax invoice · TAX-42")
    expect(email.text).toContain("Your tax invoice")
    expect(email.text).toContain("Tax amount due: PHP 1,250.00")
    expect(email.text).toContain("Tax payment invoice")
    expect(email.text).not.toContain("**")
    expect(email.text).not.toContain("##")
    expect(email.html).toContain("<h4")
    expect(email.html).toContain("TAX INVOICE")
    expect(email.html).toContain("Your tax invoice")
    expect(email.html).toContain("<strong>Tax amount due:</strong>")
    expect(email.html).toContain("Pay tax invoice securely")
    expect(email.html).toContain("Tax invoice: &lt;VAT settlement&gt;")
    expect(email.html).not.toContain("<VAT settlement>")
    expect(email.html).toContain(
      'href="https://pay.live.denpay.cc/checkout/tax-42"',
    )
  })

  it("includes an optional invoice attachment in the email payload", () => {
    const email = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        title: "Tax invoice: VAT 2026",
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
