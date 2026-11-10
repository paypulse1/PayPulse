import { useState } from "react"
import { ArrowRight, Menu, X } from "lucide-react"
import { APP_ROUTES } from "../lib/routes"
import { PLAY_STORE_URL } from "./links"

const navigationLinks = [
  { href: "#capabilities", label: "Platform" },
  { href: "#channels", label: "Payment methods" },
  { href: "#how", label: "Getting started" },
]

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="drpay-nav-links">
      {navigationLinks.map(({ href, label }) => (
        <a key={href} href={href} onClick={onNavigate}>
          {label}
        </a>
      ))}
    </div>
  )
}

function NavigationActions({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="drpay-nav-actions">
      <a
        className="drpay-login"
        href={APP_ROUTES.merchantSignIn}
        onClick={onNavigate}
      >
        Log in
      </a>
      <a
        className="drpay-button drpay-button-small"
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
      >
        Get it on Google Play <ArrowRight size={15} aria-hidden="true" />
      </a>
    </div>
  )
}

function BrandLink() {
  return (
    <a className="drpay-brand" href="#top" aria-label="DRPAY home">
      <img className="drpay-brand-mark" src="/drpay-mark.svg" alt="" />
      <span>DRPAY</span>
    </a>
  )
}

export default function MarketingNavigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  function closeMobileMenu() {
    setIsMobileMenuOpen(false)
  }

  return (
    <header className="drpay-header">
      <nav
        className="drpay-nav"
        aria-label="Main navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeMobileMenu()
        }}
      >
        <BrandLink />
        <NavigationLinks />
        <NavigationActions />
        <button
          className="drpay-mobile-menu-toggle"
          type="button"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="drpay-mobile-menu"
          onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
        >
          {isMobileMenuOpen ? (
            <X size={19} aria-hidden="true" />
          ) : (
            <Menu size={19} aria-hidden="true" />
          )}
        </button>
        <div
          className="drpay-mobile-menu"
          id="drpay-mobile-menu"
          hidden={!isMobileMenuOpen}
        >
          <NavigationLinks onNavigate={closeMobileMenu} />
          <NavigationActions onNavigate={closeMobileMenu} />
        </div>
      </nav>
    </header>
  )
}
