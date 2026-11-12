import {
  ArrowLeftRight,
  BadgeCheck,
  BellRing,
  Braces,
  Building2,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  Clock3,
  Coins,
  Fingerprint,
  Grid2X2,
  Headset,
  Landmark,
  Link,
  Link2,
  PanelsTopLeft,
  Paintbrush,
  QrCode,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type MenuIconKind = "dashboard" | "wallet" | "activity" | "collect" | "transfer" | "bank" | "building" | "verified" | "network" | "branding" | "notification" | "link" | "security" | "developer" | "support" | "scan" | "crypto" | "pending" | "allAccess"

export type MenuIconTone = "overview" | "payments" | "business" | "account"

const menuIcons: Record<MenuIconKind, LucideIcon> = {
  dashboard: PanelsTopLeft,
  wallet: Wallet,
  activity: ChartNoAxesColumnIncreasing,
  collect: CircleDollarSign,
  transfer: ArrowLeftRight,
  bank: Landmark,
  building: Building2,
  verified: BadgeCheck,
  network: Link2,
  branding: Paintbrush,
  notification: BellRing,
  link: Link,
  security: Fingerprint,
  developer: Braces,
  support: Headset,
  scan: QrCode,
  crypto: Coins,
  pending: Clock3,
  allAccess: Grid2X2,
}

export default function MenuIcon({
  kind,
  tone,
  size = 19,
}: {
  kind: MenuIconKind
  tone: MenuIconTone
  size?: number
}) {
  const Icon = menuIcons[kind]

  return (
    <Icon
      className="menu-icon-glyph"
      data-tone={tone}
      size={size}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  )
}
