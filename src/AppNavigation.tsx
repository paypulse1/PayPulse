import {
  ArrowLeftRight,
  CirclePlus,
  LayoutDashboard,
  UserRound,
  Wallet,
} from "lucide-react"

export type AppTab = "Home" | "Wallet" | "Transfer" | "Profile"

const tabs = [
  { label: "Home", icon: LayoutDashboard },
  { label: "Wallet", icon: Wallet },
  { label: "Collect", icon: CirclePlus },
  { label: "Transfer", icon: ArrowLeftRight },
  { label: "Profile", icon: UserRound },
] as const

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
      {tabs.map(({ label, icon: Icon }) => {
        const isPay = label === "Collect"
        const isActive = !isPay && activeTab === label
        return (
          <button
            type="button"
            key={label}
            className={`${isActive ? "active" : ""} ${isPay ? "pay-tab" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (isPay) onCollect()
              else onNavigate(label)
            }}
          >
            <span className="nav-icon">
              <Icon
                size={isPay ? 24 : 20}
                strokeWidth={isPay ? 2.2 : 1.8}
                aria-hidden="true"
              />
            </span>
            <small>{label}</small>
          </button>
        )
      })}
    </nav>
  )
}
