import { ArrowUpRight, Clock3, Power, ShieldCheck, Users } from "lucide-react"
import type { AdminMerchantAccount, AdminSettings } from "../lib/swiftpay"

type OverviewDestination = "payments" | "kyb" | "requests" | "audit" | "merchants"

type OverviewAdminSectionProps = {
  settings: AdminSettings
  merchants: AdminMerchantAccount[]
  activeMerchantCount: number
  totalLedgerBalance: number
  pendingTransferCount: number
  pendingCryptoWithdrawalCount: number
  reservedTransferBalance: number
  pendingPaymentCount: number
  pendingKybCount: number
  auditEventCount: number
  onNavigate: (page: OverviewDestination) => void
  maintenanceMode: boolean
  canManageMaintenance: boolean
  savingMaintenanceMode: boolean
  onToggleMaintenanceMode: () => void
}

function formatPhpAmount(amount: number) {
  return amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function OverviewAdminSection({
  settings,
  merchants,
  activeMerchantCount,
  totalLedgerBalance,
  pendingTransferCount,
  pendingCryptoWithdrawalCount,
  reservedTransferBalance,
  pendingPaymentCount,
  pendingKybCount,
  auditEventCount,
  onNavigate,
  maintenanceMode,
  canManageMaintenance,
  savingMaintenanceMode,
  onToggleMaintenanceMode,
}: OverviewAdminSectionProps) {
  const pendingWithdrawalCount =
    pendingTransferCount + pendingCryptoWithdrawalCount

  return (
    <>
      <section className="admin-card">
        <div className="admin-card-heading">
          <span className="setting-icon">
            <Power size={19} />
          </span>
          <div>
            <h2>Merchant maintenance mode</h2>
            <p>
              Temporarily replace merchant workspace pages with the maintenance
              screen. Checkout, customer, and admin pages stay available.
            </p>
          </div>
          <span
            className={`admin-status-pill ${
              maintenanceMode ? "disabled" : "active"
            }`}
          >
            {maintenanceMode ? "On" : "Off"}
          </span>
        </div>
        {canManageMaintenance ? (
          <button
            className={`button ${
              maintenanceMode ? "button-secondary" : "button-primary"
            }`}
            type="button"
            aria-pressed={maintenanceMode}
            disabled={savingMaintenanceMode}
            onClick={onToggleMaintenanceMode}
          >
            {savingMaintenanceMode
              ? "Updating…"
              : maintenanceMode
                ? "Turn maintenance off"
                : "Turn maintenance on"}
          </button>
        ) : (
          <p className="admin-empty">
            Only a super admin can change this setting.
          </p>
        )}
      </section>
      <section className="admin-card admin-action-queue">
        <div className="admin-card-heading">
          <span className="setting-icon">
            <Clock3 size={19} />
          </span>
          <div>
            <h2>Review queue</h2>
            <p>Resolve pending work first, then review the wider workspace.</p>
          </div>
          <button
            className="admin-text-action"
            type="button"
            onClick={() => onNavigate("audit")}
          >
            Audit history · {auditEventCount}
          </button>
        </div>
        <div className="admin-quick-links">
          <button type="button" onClick={() => onNavigate("payments")}>
            <span className="admin-queue-count">{pendingPaymentCount}</span>
            <strong>Payments to review</strong>
            <small>Verify incoming QRPH payments</small>
            <ArrowUpRight size={15} />
          </button>
          <button type="button" onClick={() => onNavigate("requests")}>
            <span className="admin-queue-count">{pendingWithdrawalCount}</span>
            <strong>Withdrawal requests</strong>
            <small>
              {pendingTransferCount} bank · {pendingCryptoWithdrawalCount} USDT
            </small>
            <ArrowUpRight size={15} />
          </button>
          <button type="button" onClick={() => onNavigate("kyb")}>
            <span className="admin-queue-count">{pendingKybCount}</span>
            <strong>KYB applications</strong>
            <small>Pending or in review</small>
            <ArrowUpRight size={15} />
          </button>
        </div>
      </section>
      <section className="admin-stat-grid" aria-label="Operations summary">
        <article>
          <span>Merchant accounts</span>
          <strong>{merchants.length}</strong>
          <small>
            {activeMerchantCount} active ·{" "}
            {merchants.length - activeMerchantCount} disabled
          </small>
        </article>
        <article>
          <span>Floating balance total</span>
          <strong>₱{formatPhpAmount(totalLedgerBalance)}</strong>
          <small>Before pending reservations · PHP</small>
        </article>
        <article>
          <span>Available floating balance</span>
          <strong>
            ₱
            {formatPhpAmount(
              Math.max(totalLedgerBalance - reservedTransferBalance, 0),
            )}
          </strong>
          <small>After pending transfer reservations · PHP</small>
        </article>
        <article>
          <span>Platform fee wallet</span>
          <strong>₱{formatPhpAmount(settings.superAdminFeeWallet)}</strong>
          <small>Recorded collection and transfer fees</small>
        </article>
        <article>
          <span>Collection rate</span>
          <strong>
            {settings.krwToPhpRate
              ? `${settings.krwToPhpRate.toLocaleString("en-PH")} PHP`
              : "Automatic"}
          </strong>
          <small>
            {settings.krwToPhpRate
              ? "KRW → PHP manual override"
              : "Live reference rate"}
          </small>
        </article>
        <article>
          <span>USDT collection</span>
          <strong>
            {settings.usdtAddress ? "Configured" : "Not configured"}
          </strong>
          <small>{settings.usdtNetwork || "No receiving network set"}</small>
        </article>
      </section>
      <section className="admin-card">
        <div className="admin-card-heading">
          <span className="setting-icon">
            <Users size={19} />
          </span>
          <div>
            <h2>Merchant access</h2>
            <p>Recently added accounts and their current access status.</p>
          </div>
          <button
            className="admin-text-action"
            onClick={() => onNavigate("merchants")}
          >
            Manage merchants
          </button>
        </div>
        <div className="admin-account-list">
          {merchants.slice(0, 5).map((account) => (
            <div className="admin-account-row" key={account.email}>
              <div>
                <strong>{account.email}</strong>
                <small>
                  Added {new Date(account.createdAt).toLocaleDateString()}
                </small>
              </div>
              <span
                className={`admin-status-pill ${
                  account.active ? "active" : "disabled"
                }`}
              >
                {account.active ? "Active" : "Disabled"}
              </span>
            </div>
          ))}
          {merchants.length === 0 && (
            <p className="admin-empty">
              No merchant accounts yet. Create one to get started.
            </p>
          )}
        </div>
      </section>
      <section className="admin-card admin-overview-note">
        <ShieldCheck size={18} />
        <p>
          Successful collections credit merchants net of the collection fee.
          Successful bank transfers and floating-balance payout requests debit
          the requested amount plus the fixed transfer fee. Fees are recorded in
          the platform fee wallet; refunds are exempt.
        </p>
      </section>
    </>
  )
}
