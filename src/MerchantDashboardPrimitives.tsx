import { ChevronRight, LoaderCircle, QrCode, ShieldCheck } from "lucide-react"
import { InstitutionLogo } from "./QrPaymentDisplay"
import { Brand } from "./AppPrimitives"
import type { Transaction } from "./lib/swiftpay"

export function formatWalletMovement(amount: number) {
  const sign = amount < 0 ? "−" : amount > 0 ? "+" : ""
  return `${sign}₱${Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function StatusBadge({ status }: { status: Transaction["status"] }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <i />
      {status}
    </span>
  )
}

export function DashboardLoading() {
  return (
    <main
      className="dashboard-loading-screen"
      role="status"
      aria-label="Loading merchant dashboard"
      aria-busy="true"
    >
      <div className="dashboard-loading-ambient" aria-hidden="true">
        <span className="loading-orb loading-orb-one" />
        <span className="loading-orb loading-orb-two" />
      </div>
      <section className="dashboard-loading-shell">
        <header className="dashboard-loading-brand">
          <Brand />
          <span className="loading-secure-label">
            <ShieldCheck size={13} />
            SECURE WORKSPACE
          </span>
        </header>

        <div className="dashboard-loading-intro">
          <div className="loading-emblem" aria-hidden="true">
            <LoaderCircle className="loading-emblem-spinner" size={66} />
            <img src="/drpay-mark.png" alt="" />
          </div>
          <div className="dashboard-loading-copy">
            <span className="eyebrow">MERCHANT WORKSPACE</span>
            <h1>Preparing your dashboard</h1>
            <p>Securely loading your wallet and recent activity.</p>
          </div>
        </div>

        <div className="loading-progress" aria-hidden="true">
          <span />
        </div>

        <div className="dashboard-loading-content" aria-hidden="true">
          <div className="loading-skeleton loading-balance">
            <span />
            <strong />
            <span />
          </div>
          <div className="loading-actions">
            {[0, 1, 2, 3].map((item) => (
              <span className="loading-skeleton" key={item} />
            ))}
          </div>
          <div className="loading-skeleton loading-summary">
            <span />
            <strong />
            <span />
            <span />
          </div>
        </div>

        <footer className="dashboard-loading-footer">
          <span className="loading-indicator" />
          <span>Connecting to your secure workspace</span>
        </footer>
      </section>
    </main>
  )
}

export function TransactionRow({
  transaction,
  onClick,
}: {
  transaction: Transaction
  onClick?: () => void
}) {
  const walletAmount = transaction.walletAmount ?? transaction.numericAmount
  return (
    <button className="transaction-row" onClick={onClick}>
      {transaction.institutionCode ? (
        <InstitutionLogo
          institution={{
            code: transaction.institutionCode,
            name: transaction.institutionName || transaction.customer,
            logoUrl: transaction.institutionLogoUrl,
          }}
          className="transaction-institution-logo"
        />
      ) : (
        <span className={`transaction-avatar avatar-${transaction.color}`}>
          {transaction.channel === "QR Ph checkout" ? (
            <QrCode size={18} aria-hidden="true" />
          ) : (
            transaction.initials
          )}
        </span>
      )}
      <span className="transaction-copy">
        <strong>{transaction.customer}</strong>
        <small>
          {transaction.channel} · {transaction.date.split(",")[0]}
        </small>
      </span>
      <span className="transaction-value">
        <strong>{formatWalletMovement(walletAmount)}</strong>
        <StatusBadge status={transaction.status} />
      </span>
      <ChevronRight size={16} />
    </button>
  )
}
