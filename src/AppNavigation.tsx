import { useRef, type KeyboardEvent } from "react"
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

function nextFocusIndex(key: string, index: number, count: number) {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count
    case "ArrowLeft":
      return (index - 1 + count) % count
    case "Home":
      return 0
    case "End":
      return count - 1
    default:
      return null
  }
}

const FOCUS_GUARD_MS = 500

/**
 * Keeps keyboard users on the selected tab: switching screens drops focus back
 * to the document body shortly after activation, so focus is returned to the
 * tab that was chosen.
 */
function restoreKeyboardFocus(label: string) {
  const refocus = () => {
    const active = document.activeElement
    if (active && active !== document.body) return
    document
      .querySelector<HTMLButtonElement>(
        `.bottom-nav button[data-nav-label="${label}"]`,
      )
      ?.focus()
  }
  const handleFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget === null) setTimeout(refocus, 0)
  }
  document.addEventListener("focusout", handleFocusOut, true)
  requestAnimationFrame(() => requestAnimationFrame(refocus))
  setTimeout(() => {
    document.removeEventListener("focusout", handleFocusOut, true)
    refocus()
  }, FOCUS_GUARD_MS)
}

export default function AppNavigation({
  activeTab,
  onNavigate,
  onCollect,
}: {
  activeTab: AppTab
  onNavigate: (tab: AppTab) => void
  onCollect: () => void
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextFocusIndex(event.key, index, navigationItems.length)
    if (next === null) return
    event.preventDefault()
    buttonRefs.current[next]?.focus()
  }

  return (
    <nav className="bottom-nav" aria-label="App navigation">
      {navigationItems.map((item, index) => {
        const isTab = item.type === "tab"
        const isActive = isTab && activeTab === item.tab
        const isFeatured = item.type === "action" && item.featured
        return (
          <button
            type="button"
            key={item.label}
            ref={(node) => {
              buttonRefs.current[index] = node
            }}
            className={`${isActive ? "active" : ""} ${
              isFeatured ? "pay-tab" : ""
            }`}
            aria-current={isActive ? "page" : undefined}
            onKeyDown={(event) => handleKeyDown(event, index)}
            data-nav-label={item.label}
            onClick={(event) => {
              if (item.type === "action") {
                onCollect()
                return
              }
              onNavigate(item.tab)
              if (event.detail === 0) restoreKeyboardFocus(item.label)
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
