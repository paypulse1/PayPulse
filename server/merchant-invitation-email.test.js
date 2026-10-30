import { describe, expect, it } from "vitest"
import { createMerchantInvitationEmail } from "./merchant-invitation-email.js"

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
    expect(email.text).toContain("KRW and USDT guide")
    expect(email.html).toContain("KRW and USDT guide")
    expect(email.text).toContain(
      "Alipay+ Service Access and Incorporation Addendum",
    )
    expect(email.html).toContain(
      "Alipay+ Service Access and Incorporation Addendum",
    )
    expect(email.text).toContain(
      "before the related payment service is enabled",
    )
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
})
