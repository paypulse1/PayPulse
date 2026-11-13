import { createHmac, timingSafeEqual } from "node:crypto"

export function normalizeCustomerEmail(value) {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null
  }
  return email
}

export function createCustomerOtpHash(secret, challengeId, email, code) {
  return createHmac("sha256", secret)
    .update(`customer-email-otp:${challengeId}:${email}:${code}`)
    .digest("hex")
}

export function matchesCustomerOtp(secret, challengeId, email, code, codeHash) {
  if (typeof codeHash !== "string" || !/^[\da-f]{64}$/i.test(codeHash)) {
    return false
  }
  const expected = Buffer.from(
    createCustomerOtpHash(secret, challengeId, email, code),
    "hex",
  )
  const actual = Buffer.from(codeHash, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function customerVisiblePaymentStatus(status) {
  const normalized = String(status || "").toUpperCase()
  if (
    ["EXECUTED", "MANUALLY_PAID", "SUCCESS", "COMPLETED"].includes(normalized)
  ) {
    return "COMPLETED"
  }
  if (
    ["CREATING", "ACTIVE", "PENDING", "SETTLEMENT_RETRY"].includes(normalized)
  ) {
    return "PENDING"
  }
  return null
}
