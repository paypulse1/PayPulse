import type { ReactNode } from "react"
import { Brand } from "./AppPrimitives"

type MerchantAuthLayoutProps = {
  kicker: string
  kickerIcon: ReactNode
  headline: ReactNode
  description: string
  benefits: Array<{
    icon: ReactNode
    title: string
    description: string
  }>
  eyebrow: string
  cardClassName?: string
  registration?: boolean
  children: ReactNode
}

export default function MerchantAuthLayout({
  kicker,
  kickerIcon,
  headline,
  description,
  benefits,
  eyebrow,
  cardClassName = "",
  registration = false,
  children,
}: MerchantAuthLayoutProps) {
  return (
    <main className="auth-screen auth-screen-with-footer auth-login-screen">
      <div
        className={`auth-login-layout${
          registration ? " merchant-registration-layout" : ""
        }`}
      >
        <aside className="auth-login-aside">
          <span className="auth-login-kicker">
            {kickerIcon}
            {kicker}
          </span>
          <div className="auth-login-aside-copy">
            <h2>{headline}</h2>
            <p>{description}</p>
          </div>
          <div className="auth-login-benefits">
            {benefits.map((benefit) => (
              <div key={benefit.title}>
                <span className="auth-login-benefit-icon">{benefit.icon}</span>
                <span>
                  <strong>{benefit.title}</strong>
                  <small>{benefit.description}</small>
                </span>
              </div>
            ))}
          </div>
          <span className="auth-login-glow" aria-hidden="true" />
        </aside>
        <div className="auth-login-panel">
          <div className="auth-brand">
            <Brand />
          </div>
          <section
            className={`auth-card auth-login-card ${cardClassName}`.trim()}
          >
            <span className="eyebrow">{eyebrow}</span>
            {children}
          </section>
        </div>
      </div>
    </main>
  )
}
