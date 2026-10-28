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
})
