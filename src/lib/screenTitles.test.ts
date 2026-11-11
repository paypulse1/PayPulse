import { describe, expect, it } from "vitest"
import { getMerchantScreenTitle } from "./screenTitles"

const baseState = {
  profileSection: "",
  allAccessPage: false,
  activeTab: "Home" as const,
  walletSubscreen: "overview" as const,
}

describe("getMerchantScreenTitle", () => {
  it("preserves primary tab and wallet subpage titles", () => {
    expect(getMerchantScreenTitle(baseState)).toBe("Dashboard")
    expect(
      getMerchantScreenTitle({
        ...baseState,
        activeTab: "Transfer",
      }),
    ).toBe("Transfers")
    expect(
      getMerchantScreenTitle({
        ...baseState,
        activeTab: "Wallet",
        walletSubscreen: "usdt",
      }),
    ).toBe("USDT")
  })

  it("prioritizes profile sections and All access", () => {
    expect(
      getMerchantScreenTitle({
        ...baseState,
        profileSection: "Transfer banks",
        allAccessPage: true,
      }),
    ).toBe("Transfer banks")
    expect(
      getMerchantScreenTitle({
        ...baseState,
        allAccessPage: true,
      }),
    ).toBe("All access")
  })

  it("does not apply a wallet subpage title outside the Wallet tab", () => {
    expect(
      getMerchantScreenTitle({
        ...baseState,
        activeTab: "Home",
        walletSubscreen: "usdt",
      }),
    ).toBe("Dashboard")
  })
})
