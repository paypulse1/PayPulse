import type { ReactNode } from "react"

type ButtonProps = {
  children: ReactNode
  className?: string
  icon?: ReactNode
  onClick?: () => void
  type?: "button" | "submit"
  variant?: "primary" | "secondary" | "quiet"
  disabled?: boolean
}

export function Button({
  children,
  className = "",
  icon,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  )
}

export function Brand() {
  return (
    <div className="brand" aria-label="DRPAY">
      <span className="brand-mark">
        <img src="/drpay-mark.png" alt="" />
      </span>
      <strong>DRPAY</strong>
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
        aria-label="DRPAY signature"
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
