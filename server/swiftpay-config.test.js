import { describe, expect, it } from "vitest"
import { getMissingSwiftPayCredentials } from "./swiftpay-config.js"

describe("SwiftPay credential configuration", () => {
  it("requires both credentials for sandbox transactions", () => {
    expect(getMissingSwiftPayCredentials("", "")).toEqual([
      "SWIFTPAY_ACCESS_KEY",
      "SWIFTPAY_SECRET_KEY",
    ])
  })

  it("reports only the missing credential", () => {
    expect(getMissingSwiftPayCredentials("sandbox-access-key", "")).toEqual([
      "SWIFTPAY_SECRET_KEY",
    ])
    expect(
      getMissingSwiftPayCredentials("sandbox-access-key", "sandbox-secret-key"),
    ).toEqual([])
  })
})
