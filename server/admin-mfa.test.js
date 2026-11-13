import { describe, expect, it } from "vitest"
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isTotpRequiredForAdminRole,
  matchingTotpStep,
  totpCodeAt,
  totpProvisioningUri,
} from "./admin-mfa.js"

const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

describe("operations TOTP", () => {
  it("keeps TOTP required for operations staff but optional for super admins", () => {
    expect(isTotpRequiredForAdminRole("super_admin")).toBe(false)
    expect(isTotpRequiredForAdminRole("finance")).toBe(true)
    expect(isTotpRequiredForAdminRole("compliance")).toBe(true)
    expect(isTotpRequiredForAdminRole("auditor")).toBe(true)
  })

  it("generates RFC-compatible SHA-1 codes and rejects replayed steps", () => {
    expect(totpCodeAt(secret, 59_000)).toBe("287082")
    const step = matchingTotpStep(secret, "287082", 59_000)
    expect(step).toBe(1)
    expect(matchingTotpStep(secret, "287082", 59_000, step)).toBeNull()
  })

  it("round-trips an encrypted secret and builds a provisioning URI", () => {
    const key = "a".repeat(64)
    const encrypted = encryptTotpSecret(secret, key)
    expect(encrypted).not.toContain(secret)
    expect(decryptTotpSecret(encrypted, key)).toBe(secret)
    expect(totpProvisioningUri("ops@example.com", secret)).toContain(
      "otpauth://totp/DRPAY%3Aops%40example.com",
    )
  })
})
