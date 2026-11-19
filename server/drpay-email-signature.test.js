import { describe, expect, it } from "vitest"
import { createCustomerPaymentRequestEmail } from "./customer-payment-email.js"
import { standardizeDrpayEmail } from "./drpay-email-signature.js"

describe("PayPulse outgoing email layout", () => {
  it("uses a shared branded shell and safety reminder for every email", () => {
    const email = standardizeDrpayEmail(
      {
        subject: "Example",
        text: "Message body",
        html: `
          <div style="background:#f4f7f5">
            <div style="max-width:480px;margin:auto">
              <div style="padding:0 4px 20px">PayPulse</div>
              <div style="padding:32px;background:#ffffff;border:1px solid #e2e9e4">
                <h1>Example title</h1><p>Message body</p>
              </div>
            </div>
          </div>
        `,
        attachments: [{ filename: "agreement.pdf" }],
      },
      "https://merchant.example.com/paypulse-mark.png",
    )

    expect(email.text).toContain("Message body")
    expect(email.text).toContain("PayPulse")
    expect(email.text).toContain("Never share them")
    expect(email.html.match(/<img\b/g)).toHaveLength(1)
    expect(email.html).toContain(
      '<img src="https://merchant.example.com/paypulse-mark.png" alt="PayPulse logo"',
    )
    expect(email.html).toContain("max-width:640px")
    expect(email.html).toContain("background:#edf2f7")
    expect(email.html).toContain("background:#173b63")
    expect(email.html).toContain("Security reminder</strong>")
    expect(email.html).toContain("SECURE SERVICE MESSAGE")
    expect(email.html).toContain("Example title")
    expect(email.html).toContain("Message body")
    expect(email.html).not.toContain("max-width:480px")
    expect(email.html).not.toContain("padding:32px;background:#ffffff")
    expect(email.attachments).toEqual([{ filename: "agreement.pdf" }])
    expect(email.subject).toBe("Example")
  })

  it("requires a trusted HTTPS logo URL", () => {
    expect(() =>
      standardizeDrpayEmail(
        { text: "Message body", html: "<p>Message body</p>" },
        "http://merchant.example.com/logo.png",
      ),
    ).toThrow("The PayPulse email logo URL must use HTTPS.")
    expect(() =>
      standardizeDrpayEmail(
        { text: "Message body", html: "<p>Message body</p>" },
        "not a URL",
      ),
    ).toThrow("A valid PayPulse email logo URL is required.")
  })

  it("removes legacy brand headers while preserving each email heading", () => {
    const email = standardizeDrpayEmail(
      {
        subject: "Invitation",
        text: "PayPulse MERCHANT SERVICES\n\nHello, merchant.",
        html: `
          <div style="background:#f3f6f4">
            <div style="max-width:600px">
              <div style="border-bottom:1px solid #e5ebe7">
                <div>PayPulse MERCHANT SERVICES</div>
                <h1>Merchant invitation</h1>
              </div>
              <div><p>Review and sign the agreement.</p></div>
            </div>
          </div>
        `,
      },
      "https://merchant.example.com/paypulse-mark.png",
    )

    expect(email.html.match(/PayPulse MERCHANT SERVICES/g)).toHaveLength(1)
    expect(email.text.match(/PayPulse \| SECURE SERVICE MESSAGE/g)).toHaveLength(1)
    expect(email.html).toContain("<h1>Merchant invitation</h1>")
    expect(email.html).toContain("Review and sign the agreement.")
  })

  it("applies the same banking template to customer payment requests", () => {
    const source = createCustomerPaymentRequestEmail(
      {
        customerEmail: "customer@example.com",
        title: "Invoice 2026-104",
        amount: 1250,
        referenceNo: "DRP-2026-104",
        paymentUrl: "https://pay.example.com/checkout/104",
      },
      "PayPulse <payments@example.com>",
    )
    const email = standardizeDrpayEmail(
      source,
      "https://merchant.example.com/paypulse-mark.png",
    )

    expect(email.html).toContain("SECURE SERVICE MESSAGE")
    expect(email.html).toContain("Payment request")
    expect(email.html).toContain("Invoice 2026-104")
    expect(email.html).toContain("DRP-2026-104")
    expect(email.html).toContain("https://pay.example.com/checkout/104")
    expect(email.html.match(/<img\b/g)).toHaveLength(1)
  })
})
