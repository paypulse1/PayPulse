import type { AppTab } from "../AppNavigation"

export function getMerchantScreenTitle({
  profileSection,
  allAccessPage,
  activeTab,
  walletSubscreen,
}: {
  profileSection: string
  allAccessPage: boolean
  activeTab: AppTab
  walletSubscreen: "overview" | "usdt" | "unsettled-balance"
}) {
  if (profileSection) return profileSection
  if (allAccessPage) return "All access"
  if (activeTab === "Home") return "Dashboard"
  if (activeTab === "Transfer") return "Transfers"
  if (activeTab === "Profile") return "Profile"
  if (activeTab === "Wallet" && walletSubscreen === "usdt") return "USDT"
  if (activeTab === "Wallet" && walletSubscreen === "unsettled-balance") {
    return "Pendings"
  }
  return activeTab
}
