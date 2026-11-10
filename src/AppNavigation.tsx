import {
  ArrowLeftRight,
  HandCoins,
  LayoutDashboard,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react"

export type AppTab = "Home" | "Wallet" | "Transfer" | "Profile"

const tabs: {
  label: string
  tab: AppTab | null
  icon: LucideIcon
  featured?: boolean
}[] = [
  { label: "Home", tab: "Home", icon: LayoutDashboard },
  { label: "Wallet", tab: "Wallet", icon: WalletCards },
  { label: "Collect", tab: null, icon: HandCoins, featured: true },
  { label: "Transfer", tab: "Transfer", icon: ArrowLeftRight },
  { label: "Profile", tab: "Profile", icon: UserRound },
]

export default function AppNavigation({
  activeTab,
  onNavigate,
  onCollect,
}: {
  activeTab: AppTab
  onNavigate: (tab: AppTab) => void
  onCollect: () => void
}) {
  return (
    <nav className="bottom-nav" aria-label="App navigation">
      {tabs.map(({ label, tab, icon: Icon, featured }) => {
        const isActive = tab !== null && activeTab === tab
        return (
          <button
            type="button"
            key={label}
            className={`${isActive ? "active" : ""} ${
              featured ? "pay-tab" : ""
            }`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (tab === null) onCollect()
              else onNavigate(tab)
            }}
          >
            <span className="nav-icon">
              <Icon size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <small>{label}</small>
          </button>
        )
      })}
    </nav>
  )
}
