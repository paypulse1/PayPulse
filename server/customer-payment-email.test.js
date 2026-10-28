import { describe, expect, it } from "vitest"
import { createCustomerPaymentRequestEmail } from "./customer-payment-email.js"

describe("customer payment request email", () => {
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
})
