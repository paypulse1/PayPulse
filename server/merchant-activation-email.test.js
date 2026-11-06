import { describe, expect, it } from "vitest"
import {
  createMerchantActivationEmail,
  createMerchantApiGuideEmail,
} from "./merchant-activation-email.js"

describe("merchant activation email", () => {
  it("sends the API guide and collection instructions without issuing a key", () => {
    const email = createMerchantActivationEmail({
      contactPerson: "Alex Merchant",
      businessName: "Example Trading Co.",
      portalUrl: "https://merchant.example.test/",
      postmanCollectionUrl:
        "https://merchant.example.test/postman/DRPAY-Merchant-API.postman_collection.json",
    })

    expect(email.subject).toContain("services are activated")
    expect(email.text).toContain("completed its activation requirements")
    expect(email.text).toContain(
      "Generate your own environment-specific API key",
    )
    expect(email.text).toContain("not included in this email")
    expect(email.text).toContain("payload examples")
    expect(email.html).toContain("Profile &gt; Developer hub &gt; API access")
    expect(email.html).toContain("Download Postman collection")
    expect(email.text).not.toContain("drp_production_")
    expect(email.html).not.toContain("drp_production_")
  })

  it("escapes untrusted values in HTML", () => {
    const email = createMerchantActivationEmail({
      contactPerson: "<Merchant>",
      businessName: '"Example" <Trading>',
      portalUrl: "https://merchant.example.test/?name=<merchant>",
      postmanCollectionUrl: "https://merchant.example.test/postman.json",
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
