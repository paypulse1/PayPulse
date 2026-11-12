import { useEffect, useState } from "react"
import { Capacitor } from "@capacitor/core"
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Store,
} from "lucide-react"
import { Brand, Button } from "./AppPrimitives"
import { APP_ROUTES } from "./lib/routes"
import StickerIcon, { type StickerKind } from "./StickerIcon"
import {
  getMerchantKyb,
  type DashboardData,
  type KybProfile,
  type Session,
} from "./lib/swiftpay"
import useBalanceVisibility from "./useBalanceVisibility"
import ScreenTitle from "./ScreenTitle"
import type { AppTab } from "./AppNavigation"

type AccessMenuItem = {
  label: string
  description: string
  sticker: StickerKind
  action: () => void
}

type AccessMenuSection = {
  label: string
  items: AccessMenuItem[]
}

function AccessMenuButton({ item }: { item: AccessMenuItem }) {
  return (
    <button
      type="button"
      className="all-access-item"
      onClick={item.action}
      aria-label={`${item.label}: ${item.description}`}
    >
      <span className="all-access-item-sticker" aria-hidden="true">
        <StickerIcon kind={item.sticker} size={36} />
      </span>
      <span className="all-access-item-copy">
        <strong>{item.label}</strong>
      </span>
      <ChevronRight
        className="all-access-item-chevron"
        size={16}
        aria-hidden="true"
      />
    </button>
  )
}

export function MerchantProfileView({
  session,
  data,
  refreshVersion,
}: {
  session: Session
  data: DashboardData
  refreshVersion: number
}) {
  const { balanceVisible } = useBalanceVisibility()

  return (
    <section className="merchant-profile-page" aria-label="Merchant profile">
      <ScreenTitle
        className="profile-menu-heading"
        title="Merchant profile"
        level="h2"
        description="Your merchant account information."
      />
      <MerchantProfileDetails
        session={session}
        data={data}
        balanceVisible={balanceVisible}
        refreshVersion={refreshVersion}
      />
    </section>
  )
}

function MerchantProfileDetails({
  session,
  data,
  balanceVisible,
  refreshVersion,
}: {
  session: Session
  data: DashboardData
  balanceVisible: boolean
  refreshVersion: number
}) {
  const [kybProfile, setKybProfile] = useState<KybProfile | null>(null)
  const [kybLoading, setKybLoading] = useState(true)
  const [kybError, setKybError] = useState("")

  useEffect(() => {
    let active = true
    setKybLoading(true)
    setKybError("")
    getMerchantKyb()
      .then(({ profile }) => {
        if (active) setKybProfile(profile)
      })
      .catch((error: unknown) => {
        if (active) {
          setKybError(
            error instanceof Error
              ? error.message
              : "Could not load your KYB information.",
          )
        }
      })
      .finally(() => {
        if (active) setKybLoading(false)
      })
    return () => {
      active = false
    }
  }, [refreshVersion])

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
      <section className="profile-kyb-summary" aria-label="KYB information">
        <div className="profile-info-intro">
          <strong>KYB information</strong>
          <p>Business verification details and application status.</p>
        </div>
        {kybLoading ? (
          <p className="profile-sheet-state">Loading KYB information…</p>
        ) : kybError ? (
          <p className="setup-error" role="alert">
            {kybError}
          </p>
        ) : kybProfile ? (
          <>
            <div
              className={`kyb-status status-${kybProfile.status.toLowerCase()}`}
              role="status"
            >
              <strong>{kybProfile.status.replace("_", " ")}</strong>
              {kybProfile.reviewNotes && <span>{kybProfile.reviewNotes}</span>}
            </div>
            <dl className="detail-list">
              <div>
                <dt>Legal business name</dt>
                <dd>{kybProfile.legalBusinessName}</dd>
              </div>
              <div>
                <dt>Registration number</dt>
                <dd>{kybProfile.registrationNumber}</dd>
              </div>
              <div>
                <dt>Business type</dt>
                <dd>{kybProfile.businessType}</dd>
              </div>
              <div>
                <dt>Country</dt>
                <dd>{kybProfile.country}</dd>
              </div>
              <div>
                <dt>Business address</dt>
                <dd>{kybProfile.businessAddress}</dd>
              </div>
              <div>
                <dt>Beneficial owner</dt>
                <dd>{kybProfile.ownerFullName}</dd>
              </div>
              <div>
                <dt>Date of birth</dt>
                <dd>{kybProfile.ownerDateOfBirth}</dd>
              </div>
              <div>
                <dt>Owner nationality</dt>
                <dd>{kybProfile.ownerNationality}</dd>
              </div>
              <div>
                <dt>Owner email</dt>
                <dd>{kybProfile.ownerEmail}</dd>
              </div>
              <div>
                <dt>Owner phone</dt>
                <dd>{kybProfile.ownerPhone}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <div className="kyb-status">
              <strong>Not submitted</strong>
            </div>
            <p className="profile-info-note">
              Submit your business details in KYB verification to see them here.
            </p>
          </>
        )}
      </section>
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
  const paymentLinkItems: AccessMenuItem[] =
    data.walletMode === "pooled"
      ? [
          {
            label: "Payment link",
            description: "Create and share a branded checkout link.",
            sticker: "link",
            action: onPaymentLink,
          },
        ]
      : []
  const sections: AccessMenuSection[] = [
    {
      label: "Overview",
      items: [
        {
          label: "Dashboard",
          description: "View your balance and recent activity.",
          sticker: "dashboard",
          action: () => onNavigate("Home"),
        },
        {
          label: "Wallet",
          description: "Review balances and wallet activity.",
          sticker: "wallet",
          action: () => onNavigate("Wallet"),
        },
        {
          label: "Statements",
          description: "View and download wallet activity.",
          sticker: "statement",
          action: () => onInfo("Statements"),
        },
      ],
    },
    {
      label: "Payments",
      items: [
        {
          label: "Collect payment",
          description: "Create a payment request for a customer.",
          sticker: "collect",
          action: onCollect,
        },
        ...paymentLinkItems,
        {
          label: "Transfers",
          description: "Review outgoing transfers.",
          sticker: "transfer",
          action: () => onNavigate("Transfer"),
        },
        {
          label: "Transfer banks",
          description: Capacitor.isNativePlatform()
            ? "View supported InstaPay banks."
            : "View supported InstaPay and PESONet banks.",
          sticker: "bank",
          action: () => onInfo("Transfer banks"),
        },
      ],
    },
    {
      label: "Business",
      items: [
        {
          label: "Merchant profile",
          description: "View your business and account details.",
          sticker: "merchant",
          action: () => onInfo("Merchant profile"),
        },
        {
          label: "KYB verification",
          description: "Manage business and owner verification.",
          sticker: "kyb",
          action: () => onInfo("KYB verification"),
        },
        {
          label: "Merchant downline",
          description: "Share your referral code and view referred merchants.",
          sticker: "team",
          action: () => onInfo("Merchant downline"),
        },
        {
          label: "Checkout & email branding",
          description: "Customize checkout details and payment emails.",
          sticker: "branding",
          action: () => onInfo("Checkout & email branding"),
        },
      ],
    },
    {
      label: "Account & support",
      items: [
        {
          label: "Notifications",
          description: "Manage email and push alerts.",
          sticker: "notification",
          action: () => onInfo("Notifications"),
        },
        {
          label: "Social accounts",
          description:
            "Link Google or Telegram sign-in to your merchant account.",
          sticker: "link",
          action: () => onInfo("Social accounts"),
        },
        {
          label: "Security",
          description: "Manage session and device protection.",
          sticker: "security",
          action: () => onInfo("Security"),
        },
        {
          label: "Developer hub",
          description: "Manage API access, webhooks, and integration docs.",
          sticker: "developer",
          action: () => onInfo("Developer hub"),
        },
        {
          label: "Help center",
          description: "Contact DRPAY merchant support.",
          sticker: "support",
          action: () => onInfo("Help center"),
        },
      ],
    },
  ]

  return (
    <section className="all-access-page" aria-label="All access">
      <header className="all-access-header">
        <button type="button" className="profile-back-button" onClick={onClose}>
          <ChevronLeft size={16} /> Dashboard
        </button>
        <ScreenTitle
          title="All access"
          level="h2"
          description="Shortcuts to your merchant tools and account settings."
        />
      </header>
      {sections.map((section) => (
        <section
          className="all-access-group"
          aria-label={section.label}
          key={section.label}
        >
          <div className="profile-menu-heading">
            <h3>{section.label}</h3>
          </div>
          <nav
            className="settings-list all-access-list"
            aria-label={`${section.label} tools`}
          >
            {section.items.map((item) => (
              <AccessMenuButton key={item.label} item={item} />
            ))}
          </nav>
        </section>
      ))}
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
