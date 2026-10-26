import { ChevronRight, QrCode, ShieldCheck } from "lucide-react"
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
        <span className="loading-grain" />
      </div>
      <section className="dashboard-loading-shell">
        <header className="dashboard-loading-brand">
          <Brand />
          <span className="loading-secure-label">
            <ShieldCheck size={13} />
            SECURE WORKSPACE
          </span>
        </header>

        <div className="loading-emblem" aria-hidden="true">
          <span className="loading-emblem-orbit loading-emblem-orbit-outer" />
          <span className="loading-emblem-orbit loading-emblem-orbit-inner" />
          <span className="loading-emblem-core">
            <img src="/drpay-mark.png" alt="" />
          </span>
          <span className="loading-emblem-spark loading-emblem-spark-one" />
          <span className="loading-emblem-spark loading-emblem-spark-two" />
        </div>

        <div className="dashboard-loading-copy">
          <span className="eyebrow">YOUR BUSINESS, IN MOTION</span>
          <h1>Preparing your workspace</h1>
          <p>Securely gathering your latest wallet and activity.</p>
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
          <span>Loading your merchant workspace</span>
          <span className="loading-footer-status">PLEASE WAIT</span>
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
