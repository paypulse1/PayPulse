import { describe, expect, it } from "vitest"
import {
  createCustomerOtpHash,
  customerVisiblePaymentStatus,
  matchesCustomerOtp,
  normalizeCustomerEmail,
} from "./customer-auth.js"
import { isCustomerSession } from "./access.js"

describe("customer authentication helpers", () => {
  it("accepts only customer-role sessions with the customer audience", () => {
    expect(
      isCustomerSession({
        sub: "user@example.com",
        role: "customer",
        aud: "drpay-customer",
      }),
    ).toBe(true)
    expect(
      isCustomerSession({
        sub: "merchant@example.com",
        role: "merchant",
        aud: "drpay-customer",
      }),
    ).toBe(false)
    expect(
      isCustomerSession({ sub: "user@example.com", role: "customer" }),
    ).toBe(false)
    expect(
      isCustomerSession({
        sub: "",
        role: "customer",
        aud: "drpay-customer",
      }),
    ).toBe(false)
  })

  it("normalizes valid emails and rejects malformed or oversized values", () => {
    expect(normalizeCustomerEmail("  USER@example.com ")).toBe(
      "user@example.com",
    )
    expect(normalizeCustomerEmail("not-an-email")).toBeNull()
    expect(normalizeCustomerEmail("a".repeat(250) + "@example.com")).toBeNull()
  })

  it("binds OTP hashes to the challenge, email, and code", () => {
    const secret = "test-secret"
    const hash = createCustomerOtpHash(
      secret,
      "challenge-1",
      "user@example.com",
      "123456",
    )

    expect(
      matchesCustomerOtp(
        secret,
        "challenge-1",
        "user@example.com",
        "123456",
        hash,
      ),
    ).toBe(true)
    expect(
      matchesCustomerOtp(
        secret,
        "challenge-2",
        "user@example.com",
        "123456",
        hash,
      ),
    ).toBe(false)
    expect(
      matchesCustomerOtp(
        secret,
        "challenge-1",
        "other@example.com",
        "123456",
        hash,
      ),
    ).toBe(false)
    expect(
      matchesCustomerOtp(
        secret,
        "challenge-1",
        "user@example.com",
        "000000",
        hash,
      ),
    ).toBe(false)
  })

  it("exposes only pending and completed payment states", () => {
    expect(customerVisiblePaymentStatus("SETTLEMENT_RETRY")).toBe("PENDING")
    expect(customerVisiblePaymentStatus("MANUALLY_PAID")).toBe("COMPLETED")
    expect(customerVisiblePaymentStatus("CANCELED")).toBeNull()
  })
})
