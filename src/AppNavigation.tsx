import MenuIcon, { type MenuIconKind, type MenuIconTone } from "./MenuIcon"

export type AppTab = "Home" | "Wallet" | "Transfer" | "Profile"

const tabs: {
  label: string
  tab: AppTab | null
  icon: MenuIconKind
  tone: MenuIconTone
  featured?: boolean
}[] = [
  { label: "Home", tab: "Home", icon: "dashboard", tone: "overview" },
  { label: "Wallet", tab: "Wallet", icon: "wallet", tone: "overview" },
  {
    label: "Collect",
    tab: null,
    icon: "collect",
    tone: "payments",
    featured: true,
  },
  {
    label: "Transfer",
    tab: "Transfer",
    icon: "transfer",
    tone: "payments",
  },
  { label: "Profile", tab: "Profile", icon: "building", tone: "business" },
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
      {tabs.map(({ label, tab, icon, tone, featured }) => {
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
            <span className="nav-icon" data-tone={tone}>
              <MenuIcon kind={icon} tone={tone} size={20} />
            </span>
            <small>{label}</small>
          </button>
        )
      })}
    </nav>
  )
}
