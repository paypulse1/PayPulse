import MenuIcon, { type MenuIconKind, type MenuIconTone } from "./MenuIcon"

export type AppTab = "Home" | "Wallet" | "Transfer" | "Profile"

type NavigationItem = {
  type: "tab"
  label: string
  tab: AppTab
  icon: MenuIconKind
  tone: MenuIconTone
} | {
  type: "action"
  label: string
  action: "collect"
  icon: MenuIconKind
  tone: MenuIconTone
  featured: true
}

const navigationItems = [
  {
    type: "tab",
    label: "Home",
    tab: "Home",
    icon: "dashboard",
    tone: "overview",
  },
  {
    type: "tab",
    label: "Wallet",
    tab: "Wallet",
    icon: "wallet",
    tone: "overview",
  },
  {
    type: "action",
    label: "Collect",
    action: "collect",
    icon: "collect",
    tone: "payments",
    featured: true,
  },
  {
    type: "tab",
    label: "Transfer",
    tab: "Transfer",
    icon: "transfer",
    tone: "payments",
  },
  {
    type: "tab",
    label: "Profile",
    tab: "Profile",
    icon: "building",
    tone: "business",
  },
] as const satisfies readonly NavigationItem[]

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
      {navigationItems.map((item) => {
        const isTab = item.type === "tab"
        const isActive = isTab && activeTab === item.tab
        const isFeatured = item.type === "action" && item.featured
        return (
          <button
            type="button"
            key={item.label}
            className={`${isActive ? "active" : ""} ${
              isFeatured ? "pay-tab" : ""
            }`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (item.type === "action") onCollect()
              else onNavigate(item.tab)
            }}
          >
            <span className="nav-icon" data-tone={item.tone}>
              <MenuIcon kind={item.icon} tone={item.tone} size={20} />
            </span>
            <small>{item.label}</small>
          </button>
        )
      })}
    </nav>
  )
}
