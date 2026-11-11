import { Capacitor } from "@capacitor/core"
import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  HandCoins,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Link2,
  LogOut,
  ReceiptText,
  Settings,
  ShieldCheck,
  Store,
  Users,
  WalletCards,
} from "lucide-react"
import { Brand, Button } from "./AppPrimitives"
import { APP_ROUTES } from "./lib/routes"
import type { DashboardData, Session } from "./lib/swiftpay"
import useBalanceVisibility from "./useBalanceVisibility"
import type { AppTab } from "./AppNavigation"

export function MerchantProfileView({
  session,
  data,
}: {
  session: Session
  data: DashboardData
}) {
  const { balanceVisible } = useBalanceVisibility()

  return (
    <section className="merchant-profile-page" aria-label="Merchant profile">
      <div className="profile-menu-heading">
        <h2>Merchant profile</h2>
        <p>Your merchant account information.</p>
      </div>
      <MerchantProfileDetails
        session={session}
        data={data}
        balanceVisible={balanceVisible}
      />
    </section>
  )
}

function MerchantProfileDetails({
  session,
  data,
  balanceVisible,
}: {
  session: Session
  data: DashboardData
  balanceVisible: boolean
}) {
  return (
    <>
      <div className="profile-detail-hero">
        <span className="profile-avatar">
          <Store size={20} aria-hidden="true" />
        </span>
        <div>
          <strong>{session.email}</strong>
          <span className="profile-account-badge">
            <Store size={12} aria-hidden="true" /> Merchant account
          </span>
        </div>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Account role</dt>
          <dd>{session.role.replace("_", " ")}</dd>
        </div>
        <div>
          <dt>Wallet type</dt>
          <dd>Merchant</dd>
        </div>
        <div>
          <dt>Available Balance</dt>
          <dd>{balanceVisible ? data.availableBalance : "₱ ••••••"}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>
            {data.paymentEnvironment === "production" ? "Live" : "Sandbox"}
          </dd>
        </div>
      </dl>
    </>
  )
}

export function AllAccessView({
  data,
  onPaymentLink,
  onInfo,
  onSignOut,
  onClose,
  onNavigate,
  onCollect,
}: {
  data: DashboardData
  onPaymentLink: () => void
  onInfo: (title: string) => void
  onSignOut: () => void
  onClose: () => void
  onNavigate: (tab: AppTab) => void
  onCollect: () => void
}) {
  const items = [
    {
      label: "Dashboard",
      description: "View your balance and recent activity.",
      icon: LayoutDashboard,
      action: () => onNavigate("Home"),
    },
    {
      label: "Wallet",
      description: "Review balances and wallet activity.",
      icon: WalletCards,
      action: () => onNavigate("Wallet"),
    },
    {
      label: "Collect payment",
      description: "Create a payment request for a customer.",
      icon: HandCoins,
      action: onCollect,
    },
    {
      label: "Transfers",
      description: "Review outgoing transfers.",
      icon: ArrowLeftRight,
      action: () => onNavigate("Transfer"),
    },
    {
      label: "Merchant profile",
      description: "View your business and account details.",
      icon: Store,
      action: () => onInfo("Merchant profile"),
    },
    {
      label: "Merchant downline",
      description: "Share your referral code and view referred merchants.",
      icon: Users,
      action: () => onInfo("Merchant downline"),
    },
    {
      label: "Checkout & email branding",
      description: "Customize checkout details and payment emails.",
      icon: Settings,
      action: () => onInfo("Checkout & email branding"),
    },
    ...(data.walletMode === "pooled"
      ? [
          {
            label: "Payment link",
            description: "Create and share a branded checkout link.",
            icon: Link2,
            action: onPaymentLink,
          },
        ]
      : []),
    {
      label: "Transfer banks",
      description: Capacitor.isNativePlatform()
        ? "View supported InstaPay banks."
        : "View supported InstaPay and PESONet banks.",
      icon: Landmark,
      action: () => onInfo("Transfer banks"),
    },
    {
      label: "Statements",
      description: "View and download wallet activity.",
      icon: ReceiptText,
      action: () => onInfo("Statements"),
    },
    {
      label: "Notifications",
      description: "Manage email and push alerts.",
      icon: Bell,
      action: () => onInfo("Notifications"),
    },
    {
      label: "Social accounts",
      description: "Link Google or Telegram sign-in to your merchant account.",
      icon: Link2,
      action: () => onInfo("Social accounts"),
    },
    {
      label: "Security",
      description: "Manage session and device protection.",
      icon: ShieldCheck,
      action: () => onInfo("Security"),
    },
    {
      label: "KYB verification",
      description: "Manage business and owner verification.",
      icon: BadgeCheck,
      action: () => onInfo("KYB verification"),
    },
    {
      label: "Developer hub",
      description: "Manage API access, webhooks, and integration docs.",
      icon: KeyRound,
      action: () => onInfo("Developer hub"),
    },
    {
      label: "Help center",
      description: "Contact DRPAY merchant support.",
      icon: CircleHelp,
      action: () => onInfo("Help center"),
    },
  ]

  return (
    <section className="all-access-page" aria-label="All access">
      <header className="all-access-header">
        <button type="button" className="profile-back-button" onClick={onClose}>
          <ChevronLeft size={16} /> Dashboard
        </button>
        <h2>All access</h2>
        <p>Shortcuts to your merchant tools and account settings.</p>
      </header>
      <div className="profile-menu-heading">
        <h3>Merchant tools</h3>
      </div>
      <nav
        className="settings-list all-access-list"
        aria-label="Merchant tools"
      >
        {items.map(({ label, description, icon: Icon, action }) => (
          <button type="button" key={label} onClick={action}>
            <span className="setting-icon">
              <Icon size={20} strokeWidth={2} />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </nav>
      <Button
        variant="secondary"
        className="sign-out-button"
        icon={<LogOut size={17} />}
        onClick={onSignOut}
      >
        Sign out
      </Button>
      <div className="powered-by">
        <Brand />
      </div>
      <nav className="app-legal-links" aria-label="Legal and support">
        <a href={APP_ROUTES.privacy}>Privacy Policy</a>
        <a href={APP_ROUTES.terms}>Terms of Service</a>
        <a href={APP_ROUTES.contact}>Contact Us</a>
      </nav>
    </section>
  )
}
