import { describe, expect, it } from "vitest"
import {
  getPostAssignmentUsdtBalance,
  isActivationGatedOperation,
  isMerchantFullyActivated,
  isSinceAssignment,
  meetsUsdtMinimumBalance,
} from "./merchant-activation.js"

describe("merchant activation milestones", () => {
  it("requires the activation fee and 100 qualifying USDT for full activation", () => {
    expect(
      isMerchantFullyActivated({
        activationFeePaid: false,
        qualifyingUsdtBalance: "100",
      }),
    ).toBe(false)
    expect(
      isMerchantFullyActivated({
        activationFeePaid: true,
        qualifyingUsdtBalance: "100",
      }),
    ).toBe(true)
    expect(
      isMerchantFullyActivated({
        activationFeePaid: true,
        qualifyingUsdtBalance: "99.999999",
      }),
    ).toBe(false)
  })

  it("counts only the post-assignment balance increase toward 100 USDT", () => {
    expect(getPostAssignmentUsdtBalance("149.5", "50")).toBe("99.5")
    expect(getPostAssignmentUsdtBalance("150", "50")).toBe("100")
    expect(getPostAssignmentUsdtBalance("25", "50")).toBe("0")
    expect(getPostAssignmentUsdtBalance(null, "0")).toBeNull()
    expect(meetsUsdtMinimumBalance("99.999999")).toBe(false)
    expect(meetsUsdtMinimumBalance("100")).toBe(true)
  })

  it("excludes USDT transfers that predate the wallet assignment", () => {
    const assignedAt = "2026-03-01T10:00:00.000Z"
    expect(isSinceAssignment(Date.parse(assignedAt), assignedAt)).toBe(true)
    expect(isSinceAssignment(Date.parse(assignedAt) - 1, assignedAt)).toBe(
      false,
    )
    expect(isSinceAssignment("invalid", assignedAt)).toBe(false)
  })

  it("holds transfers and API integrations while preserving collection", () => {
    expect(isActivationGatedOperation("POST", "/disbursements")).toBe(true)
    expect(
      isActivationGatedOperation("POST", "/floating-balance/transfer-requests"),
    ).toBe(true)
    expect(isActivationGatedOperation("POST", "/api-keys")).toBe(true)
    expect(isActivationGatedOperation("POST", "/payment-links")).toBe(false)
    expect(isActivationGatedOperation("GET", "/api-keys")).toBe(false)
  })
})
