import { describe, expect, it } from "vitest"
import { createMerchantKybReviewEmail } from "./merchant-kyb-review-email.js"

describe("merchant KYB review emails", () => {
  it("rejects unknown review statuses", () => {
    expect(() =>
      createMerchantKybReviewEmail({
        contactPerson: "Alex Merchant",
        status: "toString",
        reviewNotes: "",
        accessEnabled: false,
        portalUrl: "https://merchant.example.test/login",
      }),
    ).toThrow("Unsupported KYB review email status.")
  })

  it("distinguishes KYB approval from enabled account access", () => {
    const email = createMerchantKybReviewEmail({
      contactPerson: "Alex Merchant",
      status: "APPROVED",
      reviewNotes: "",
      accessEnabled: false,
      portalUrl: "https://merchant.example.test/login",
    })

    expect(email.subject).toContain("KYB review is approved")
    expect(email.text).toContain("login access has not been enabled yet")
    expect(email.text).toContain("separate email when your access is ready")
    expect(email.text).not.toContain("Sign in to DRPAY")
    expect(email.html).not.toContain("Open merchant portal")
  })

  it("includes the sign-in action only when access is enabled", () => {
    const email = createMerchantKybReviewEmail({
      contactPerson: "Alex Merchant",
      status: "APPROVED",
      reviewNotes: "",
      accessEnabled: true,
      portalUrl: "https://merchant.example.test/login",
    })

    expect(email.text).toContain("merchant access is enabled")
    expect(email.html).toContain("Sign in to DRPAY")
  })

  it("escapes review notes and gives rejected applications a clear next step", () => {
    const email = createMerchantKybReviewEmail({
      contactPerson: "Alex Merchant",
      status: "REJECTED",
      reviewNotes: "<script>alert(1)</script>",
      accessEnabled: false,
      portalUrl: "https://merchant.example.test/login",
    })

    expect(email.text).toContain("contact your DRPAY representative")
    expect(email.text).toContain("<script>alert(1)</script>")
    expect(email.html).toContain("&lt;script&gt;")
    expect(email.html).not.toContain("<script>")
  })
})
