import { ChevronRight, Eye, QrCode, Send } from "lucide-react"
import { InstitutionLogo } from "./QrPaymentDisplay"
import AppLoadingScreen from "./AppLoadingScreen"
import MenuIcon, { type MenuIconKind, type MenuIconTone } from "./MenuIcon"
import type { DashboardData, Transaction } from "./lib/swiftpay"

export function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatWalletMovement(amount: number) {
  const sign = amount < 0 ? "−" : amount > 0 ? "+" : ""
  return `${sign}₱${Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function AvailableBalanceCard({
  data,
  balanceVisible,
  onToggleBalanceVisibility,
  onWithdraw,
}: {
  data: DashboardData
  balanceVisible: boolean
  onToggleBalanceVisibility: () => void
  onWithdraw?: () => void
}) {
  return (
    <section
      className={`balance-card ${onWithdraw ? "balance-card-wallet" : ""}`}
    >
      <div className="balance-top">
        <span>Available Balance</span>
        <div className="balance-top-actions">
          <span className="balance-bank-brand">
            <img src="/powered-by/netbank.png" alt="Netbank" />
          </span>
          <button
            type="button"
            onClick={onToggleBalanceVisibility}
            aria-label={balanceVisible ? "Hide balances" : "Show balances"}
            aria-pressed={!balanceVisible}
          >
            <Eye size={15} /> PHP
          </button>
        </div>
      </div>
      <strong className="balance-value">
        {balanceVisible ? data.availableBalance : "₱ ••••••"}
      </strong>
      {onWithdraw && (
        <div className="balance-card-footer">
          <div className="balance-card-footer-copy">
            <span>
              <i />{" "}
              {data.paymentEnvironment === "production" ? "Live" : "Sandbox"}
            </span>
            {data.reservedBalance > 0 && (
              <small>
                {formatPeso(data.reservedBalance)} reserved for pending
                transfers
              </small>
            )}
          </div>
          <button
            type="button"
            className="balance-card-withdraw"
            onClick={onWithdraw}
          >
            <Send size={14} /> Transfer PHP
          </button>
        </div>
      )}
    </section>
  )
}

export function QuickAction({
  icon,
  tone,
  label,
  onClick,
}: {
  icon: MenuIconKind
  tone: MenuIconTone
  label: string
  onClick?: () => void
}) {
  return (
    <button type="button" className="quick-action" onClick={onClick}>
      <span className="quick-action-icon" data-tone={tone}>
        <MenuIcon kind={icon} tone={tone} size={22} />
      </span>
      <strong>{label}</strong>
    </button>
  )
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
