import { ChevronRight, QrCode } from "lucide-react"
import { InstitutionLogo } from "./QrPaymentDisplay"
import AppLoadingScreen from "./AppLoadingScreen"
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
    <AppLoadingScreen
      label="Loading your dashboard"
      description="Preparing your merchant workspace…"
    />
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
