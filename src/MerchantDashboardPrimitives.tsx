import { ChevronRight, LoaderCircle, QrCode } from "lucide-react"
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
      <section className="dashboard-loading-shell">
        <header className="dashboard-loading-brand">
          <Brand />
        </header>
        <div className="dashboard-loading-intro">
          <div className="loading-emblem" aria-hidden="true">
            <LoaderCircle className="loading-emblem-spinner" size={66} />
            <img src="/drpay-mark.png" alt="" />
          </div>
          <div className="dashboard-loading-copy">
            <h1>Loading your workspace</h1>
            <p>Preparing your merchant dashboard…</p>
          </div>
        </div>
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
          {transaction.channel === "QR Ph checkout"
            ? "QRPH checkout"
            : transaction.channel}{" "}
          · {transaction.date.split(",")[0]}
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
