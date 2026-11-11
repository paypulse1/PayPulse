import { describe, expect, it } from "vitest"
import {
  createMerchantInvitationEmail,
  sendMerchantInvitationEmail,
} from "./merchant-invitation-email.js"

describe("merchant invitation email", () => {
  it("keeps confidential commercial terms in the attached agreement only", () => {
    const email = createMerchantInvitationEmail({
      contactPerson: "Alex Merchant",
      providerName: "DRPAY",
      businessName: "Example Trading Co.",
      invitationUrl: "https://merchant.example.com/",
    })

    for (const body of [email.text, email.html]) {
      expect(body).toContain("confidential commercial terms")
      expect(body).not.toContain("0.5%")
      expect(body).not.toContain("PHP 15.00")
      expect(body).not.toContain("PHP 5,000.00")
      expect(body).not.toContain("successful-collection fee")
      expect(body).not.toContain("activation fee")
    }

    expect(email.text).toContain("Agreement")
    expect(email.html).toContain("Agreement")
    expect(email.text).toContain("strict confidentiality, non-disclosure")
    expect(email.html).toContain("STRICTLY CONFIDENTIAL")
    expect(email.text).toContain("named recipient")
    expect(email.text).not.toContain("KRW and USDT guide")
    expect(email.html).not.toContain("KRW and USDT guide")
    expect(email.text).not.toContain("KRW/PHP")
    expect(email.text).toContain(
      "Alipay+ Service Access and Incorporation Addendum",
    )
    expect(email.html).toContain(
      "Alipay+ Service Access and Incorporation Addendum",
    )
    expect(email.text).toContain(
      "before the related payment service is enabled",
    )
    expect(email.text).toContain(
      "one-time verification code sent to your inbox",
    )
    expect(email.html).toContain("Review and sign")
  })

  it("escapes untrusted values in the HTML body", () => {
    const email = createMerchantInvitationEmail({
      contactPerson: "<Merchant>",
      providerName: "DRPAY & Co.",
      businessName: '"Example" <Trading>',
      invitationUrl: "https://merchant.example.com/?name=<merchant>",
    })

    expect(email.html).toContain("&lt;Merchant&gt;")
    expect(email.html).toContain("DRPAY &amp; Co.")
    expect(email.html).toContain("&quot;Example&quot; &lt;Trading&gt;")
    expect(email.html).not.toContain("<Merchant>")
  })

  it("sends the invitation and agreements through Resend", async () => {
    let request
    await sendMerchantInvitationEmail({
      to: "merchant@example.com",
      from: "DRPAY <accounts@example.com>",
      apiKey: "test-key",
      attachments: [{ filename: "agreement.pdf", content: "cGRm" }],
      invitation: {
        contactPerson: "Alex Merchant",
        providerName: "DRPAY",
        businessName: "Example Trading Co.",
        invitationUrl: "https://merchant.example.com/login",
      },
      fetchImpl: async (url, options) => {
        request = { url, options, body: JSON.parse(options.body) }
        return { ok: true, status: 200 }
      },
    })

    expect(request.url).toBe("https://api.resend.com/emails")
    expect(request.options.headers.Authorization).toBe("Bearer test-key")
    expect(request.body.to).toEqual(["merchant@example.com"])
    expect(request.body.from).toBe("DRPAY <accounts@example.com>")
    expect(request.body.attachments).toEqual([
      { filename: "agreement.pdf", content: "cGRm" },
    ])
    expect(request.body.subject).toContain("merchant invitation")
  })

  it("reports provider rejection instead of treating it as sent", async () => {
    await expect(
      sendMerchantInvitationEmail({
        to: "merchant@example.com",
        from: "accounts@example.com",
        apiKey: "test-key",
        attachments: [],
        invitation: {
          contactPerson: "Alex Merchant",
          providerName: "DRPAY",
          businessName: "Example Trading Co.",
          invitationUrl: "https://merchant.example.com/login",
        },
        fetchImpl: async () => ({ ok: false, status: 422 }),
      }),
    ).rejects.toThrow("Resend returned HTTP 422.")
  })
})
