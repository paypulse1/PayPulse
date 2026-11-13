import { describe, expect, it } from "vitest"
import { createCustomerOtpEmail } from "./customer-otp-email.js"

describe("customer OTP emails", () => {
  it("uses customer-only copy and includes the verification code", () => {
    const message = createCustomerOtpEmail("482913")

    expect(message.subject).toContain("customer sign-in")
    expect(message.text).toContain("view your payment history")
    expect(message.text).toContain("10 minutes")
    expect(message.text).toContain("482913")
    expect(message.html).toContain("482913")
    expect(message.text).not.toContain("merchant registration")
  })

  it("rejects malformed verification codes", () => {
    expect(() => createCustomerOtpEmail("<script>")).toThrow(
      "A six-digit customer verification code is required.",
    )
  })
})
