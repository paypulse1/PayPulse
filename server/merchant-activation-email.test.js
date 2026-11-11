import { describe, expect, it } from "vitest"
import {
  createMerchantActivationEmail,
  createMerchantApiGuideEmail,
} from "./merchant-activation-email.js"

describe("merchant activation email", () => {
  it("confirms merchant access and explains how to verify a new device", () => {
    const email = createMerchantActivationEmail({
      contactPerson: "Alex Merchant",
      businessName: "Example Trading Co.",
      portalUrl: "https://merchant.example.test/",
    })

    expect(email.subject).toContain("merchant access is ready")
    expect(email.text).toContain(
      "account for Example Trading Co. is now active",
    )
    expect(email.text).toContain("verification code sent to your inbox")
    expect(email.html).toContain("Open merchant portal")
    expect(email.text).not.toContain("API Integration Guide")
  })

  it("escapes untrusted values in HTML", () => {
    const email = createMerchantActivationEmail({
      contactPerson: "<Merchant>",
      businessName: '"Example" <Trading>',
      portalUrl: "https://merchant.example.test/?name=<merchant>",
    })

    expect(email.html).toContain("&lt;Merchant&gt;")
    expect(email.html).toContain("&quot;Example&quot; &lt;Trading&gt;")
    expect(email.html).not.toContain("<Merchant>")
  })
})

describe("merchant API guide email", () => {
  it("uses a resend-specific message and does not imply account activation", () => {
    const email = createMerchantApiGuideEmail({
      contactPerson: "Alex Merchant",
      portalUrl: "https://merchant.example.test/login",
      postmanCollectionUrl:
        "https://merchant.example.test/postman/DRPAY-Merchant-API.postman_collection.json",
    })

    expect(email.subject).toContain("integration guide")
    expect(email.text).toContain("As requested")
    expect(email.text).toContain("Merchant API Integration Guide")
    expect(email.text).not.toContain("activation requirements")
    expect(email.html).toContain("Download Postman collection")
  })
})
