import { describe, expect, it } from "vitest"
import { formatTokenBalance, tronAddressPayload } from "./tron-usdt.js"

describe("TRON USDT helpers", () => {
  it("decodes and checksum-validates a TRON address", () => {
    const payload = tronAddressPayload("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")

    expect(payload?.toString("hex")).toBe(
      "41a614f803b6fd780986a42c78ec9c7f77e6ded13c",
    )
    expect(tronAddressPayload("T0-not-a-valid-address")).toBeNull()
    expect(tronAddressPayload("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6s")).toBeNull()
  })

  it("formats raw token units without floating-point precision loss", () => {
    expect(formatTokenBalance("12d687", 6)).toBe("1.234567")
    expect(formatTokenBalance("f4240", 6)).toBe("1")
    expect(formatTokenBalance("0", 6)).toBe("0")
    expect(formatTokenBalance("0x10", 6)).toBeNull()
  })
})