import { ChevronRight, QrCode } from "lucide-react"
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
    >
      <div className="dashboard-loading-brand">
        <Brand />
        <span className="loading-indicator" />
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
      <span className="dashboard-loading-label">
        Loading your merchant workspace…
      </span>
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
