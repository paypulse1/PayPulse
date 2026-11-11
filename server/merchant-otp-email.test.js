import { describe, expect, it } from "vitest"
import { createMerchantOtpEmail } from "./merchant-otp-email.js"

describe("merchant OTP emails", () => {
  it("uses separate confirmation and device-sign-in copy", () => {
    const registration = createMerchantOtpEmail({
      code: "482913",
      purpose: "registration",
    })
    const device = createMerchantOtpEmail({
      code: "482913",
      purpose: "device",
    })

    expect(registration.subject).toContain("Confirm your DRPAY email")
    expect(registration.text).toContain("merchant registration")
    expect(registration.text).toContain("10 minutes")
    expect(registration.text).toContain("482913")
    expect(registration.html).toContain("482913")
    expect(device.subject).toContain("sign-in code")
    expect(device.text).toContain("verify this device")
    expect(device.subject).not.toBe(registration.subject)
  })

  it("rejects unsupported purposes and malformed codes", () => {
    expect(() =>
      createMerchantOtpEmail({ code: "482913", purpose: "other" }),
    ).toThrow("Unsupported merchant verification email purpose.")
    expect(() =>
      createMerchantOtpEmail({ code: "482913", purpose: "toString" }),
    ).toThrow("Unsupported merchant verification email purpose.")
    expect(() =>
      createMerchantOtpEmail({ code: "<script>", purpose: "device" }),
    ).toThrow("A six-digit merchant verification code is required.")
  })
})
