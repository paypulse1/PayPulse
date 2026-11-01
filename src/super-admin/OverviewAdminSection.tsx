import { ArrowUpRight, Clock3, ShieldCheck, Users } from "lucide-react"
import type { AdminMerchantAccount, AdminSettings } from "../lib/swiftpay"

type OverviewDestination = "payments" | "kyb" | "requests" | "audit" | "merchants"

type OverviewAdminSectionProps = {
  settings: AdminSettings
  merchants: AdminMerchantAccount[]
  activeMerchantCount: number
  totalLedgerBalance: number
  pendingTransferCount: number
  reservedTransferBalance: number
  pendingPaymentCount: number
  pendingKybCount: number
  auditEventCount: number
  onNavigate: (page: OverviewDestination) => void
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
  reservedTransferBalance,
  pendingPaymentCount,
  pendingKybCount,
  auditEventCount,
  onNavigate,
}: OverviewAdminSectionProps) {
  return (
    <>
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
          <small>Pending requests are reserved · PHP</small>
        </article>
        <article>
          <span>Pending transfer requests</span>
          <strong>{pendingTransferCount}</strong>
          <small>Awaiting team review</small>
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
          <span>Pending payments</span>
          <strong>{pendingPaymentCount}</strong>
          <small>Awaiting payment confirmation review</small>
        </article>
        <article>
          <span>KYB applications</span>
          <strong>{pendingKybCount}</strong>
          <small>Pending or in review</small>
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
            <Clock3 size={19} />
          </span>
          <div>
            <h2>Needs attention</h2>
            <p>Jump directly to pending reviews and recent changes.</p>
          </div>
        </div>
        <div className="admin-quick-links">
          <button type="button" onClick={() => onNavigate("payments")}>
            <span>{pendingPaymentCount}</span> Payments to review{" "}
            <ArrowUpRight size={15} />
          </button>
          <button type="button" onClick={() => onNavigate("kyb")}>
            <span>{pendingKybCount}</span> KYB applications{" "}
            <ArrowUpRight size={15} />
          </button>
          <button type="button" onClick={() => onNavigate("requests")}>
            <span>{pendingTransferCount}</span> Transfer requests{" "}
            <ArrowUpRight size={15} />
          </button>
          <button type="button" onClick={() => onNavigate("audit")}>
            <span>{auditEventCount}</span> Recorded audit events{" "}
            <ArrowUpRight size={15} />
          </button>
        </div>
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
