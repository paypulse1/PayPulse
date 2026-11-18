import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { isValidElement, type ReactNode } from "react"

type ButtonProps = {
  children: ReactNode
  className?: string
  icon?: ReactNode
  onClick?: () => void
  type?: "button" | "submit"
  variant?: "primary" | "secondary" | "quiet"
  size?: "sm" | "md" | "lg"
  disabled?: boolean
}

function getButtonText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children)
  }
  if (Array.isArray(children)) {
    return children.map(getButtonText).join(" ")
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return getButtonText(children.props.children)
  }
  return ""
}

function getActionIcon(children: ReactNode, type: ButtonProps["type"]) {
  const label = getButtonText(children).toLowerCase()
  const iconProps = { size: 15, strokeWidth: 2.2 }

  if (/\b(delete|deleting|remove|revoke|revoking)\b/.test(label))
    return <Trash2 {...iconProps} />
  if (/\b(copy|copied)\b/.test(label)) return <Copy {...iconProps} />
  if (/\b(download|export)\b/.test(label)) return <Download {...iconProps} />
  if (/\bupload\b/.test(label)) return <Upload {...iconProps} />
  if (/\b(search|find)\b/.test(label)) return <Search {...iconProps} />
  if (/\b(send|resend|transfer|pay|payout)\b/.test(label))
    return <Send {...iconProps} />
  if (/\b(refresh|retry|reload|try again)\b/.test(label))
    return <RefreshCw {...iconProps} />
  if (/\b(back|previous)\b/.test(label)) return <ArrowLeft {...iconProps} />
  if (/\b(close|cancel|dismiss)\b/.test(label)) return <X {...iconProps} />
  if (/\b(sign out|log out)\b/.test(label)) return <LogOut {...iconProps} />
  if (/\b(sign in|log in)\b/.test(label)) return <LogIn {...iconProps} />
  if (/\b(print)\b/.test(label)) return <Printer {...iconProps} />
  if (/\b(review|view|details)\b/.test(label)) return <Eye {...iconProps} />
  if (/\b(approve|verify|verified)\b/.test(label))
    return <ShieldCheck {...iconProps} />
  if (/\b(add|invite|new|create|generate)\b/.test(label))
    return <Plus {...iconProps} />
  if (/\b(save|saving|update|updating)\b/.test(label))
    return <Save {...iconProps} />
  if (/\b(done|complete|confirm|enable|enabled|submit|continue)\b/.test(label))
    return <CircleCheck {...iconProps} />
  if (/\b(edit|change|manage)\b/.test(label)) return <Pencil {...iconProps} />
  if (/\b(load more|show more|expand)\b/.test(label))
    return <ChevronDown {...iconProps} />
  if (/\b(ok|yes|got it)\b/.test(label)) return <Check {...iconProps} />
  if (type === "submit") return <ClipboardCheck {...iconProps} />
  return <ArrowRight {...iconProps} />
}

export function IconButton({
  children,
  label,
  onClick,
  dark = false,
  className = "",
  disabled = false,
  title,
}: {
  children: ReactNode
  label: string
  onClick?: () => void
  dark?: boolean
  className?: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={`icon-button ${
        dark ? "icon-button-dark" : ""
      } ${className}`.trim()}
      aria-label={label}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="icon-button-icon" aria-hidden="true">
        {children}
      </span>
    </button>
  )
}

export function Button({
  children,
  className = "",
  icon,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled,
}: ButtonProps) {
  const buttonIcon = icon || getActionIcon(children, type)
  const classes = [
    "button",
    `button-${variant}`,
    `button-size-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
    >
      {buttonIcon && (
        <span className="button-icon" aria-hidden="true">
          {buttonIcon}
        </span>
      )}
      {children}
    </button>
  )
}

export function Brand() {
  return (
    <div className="brand" aria-label="PulsePay">
      <span className="brand-mark" aria-hidden="true">
        <span>P</span>
      </span>
      <strong>PulsePay</strong>
    </div>
  )
}

export function PoweredByFooter() {
  return (
    <footer className="auth-powered-by" aria-label="Supported by our partners">
      <span>Supported By</span>
      <span
        className="auth-powered-by-signature"
        role="img"
        aria-label="PulsePay signature"
      />
      <ul className="auth-powered-by-partners">
        <li>
          <img src="/powered-by/black-sheep.png" alt="Black Sheep" />
        </li>
        <li>
          <img src="/powered-by/drl-technology.png" alt="DRL Technology" />
        </li>
        <li>
          <img src="/powered-by/netbank.png" alt="Netbank" />
        </li>
      </ul>
    </footer>
  )
}
