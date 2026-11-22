import {
  ArrowRightLeft,
  BadgeCheck,
  BellDot,
  ChartColumnIncreasing,
  CodeXml,
  Coins,
  HandCoins,
  Hourglass,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Link2,
  Network,
  Palette,
  ScanLine,
  ShieldCheck,
  Store,
  WalletMinimal,
  type LucideIcon,
} from "lucide-react"

export type MenuIconKind = "dashboard" | "wallet" | "activity" | "collect" | "transfer" | "bank" | "building" | "verified" | "network" | "branding" | "notification" | "link" | "security" | "developer" | "support" | "scan" | "crypto" | "pending" | "allAccess"

export type MenuIconTone = "overview" | "payments" | "business" | "account"

const menuIcons: Record<MenuIconKind, LucideIcon> = {
  dashboard: LayoutDashboard,
  wallet: WalletMinimal,
  activity: ChartColumnIncreasing,
  collect: HandCoins,
  transfer: ArrowRightLeft,
  bank: Landmark,
  building: Store,
  verified: BadgeCheck,
  network: Network,
  branding: Palette,
  notification: BellDot,
  link: Link2,
  security: ShieldCheck,
  developer: CodeXml,
  support: LifeBuoy,
  scan: ScanLine,
  crypto: Coins,
  pending: Hourglass,
  allAccess: LayoutGrid,
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
      strokeWidth={1.75}
      absoluteStrokeWidth
      aria-hidden="true"
    />
  )
}
