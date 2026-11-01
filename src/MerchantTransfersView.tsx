import { Capacitor } from "@capacitor/core"
import { Send, ShieldCheck } from "lucide-react"
import { Button } from "./AppPrimitives"
import { TransactionRow } from "./MerchantDashboardPrimitives"
import { useBalanceVisibility } from "./lib/useBalanceVisibility"
import type { DashboardData, Transaction } from "./lib/swiftpay"

type MerchantTransfersViewProps = {
  data: DashboardData
  onTransfer: () => void
  onTransaction: (transaction: Transaction) => void
}

export default function MerchantTransfersView({
  data,
  onTransfer,
  onTransaction,
}: MerchantTransfersViewProps) {
  const { balanceVisible } = useBalanceVisibility()
  const recentTransfers = data.transactions
    .filter((transaction) => transaction.numericAmount < 0)
    .slice(0, 4)

  return (
    <section className="transfers-page">
      <section className="transfer-balance-panel">
        <div>
          <span>Available Balance</span>
          <strong>{balanceVisible ? data.availableBalance : "₱ ••••••"}</strong>
        </div>
        <Button icon={<Send size={17} />} onClick={onTransfer}>
          New transfer
        </Button>
      </section>
      <section className="transfer-methods-card">
        <h2>Choose a transfer network</h2>
        <div className="transfer-method-row">
          <img
            className="transfer-method-logo"
            src="/bank-logos/instapay.png"
            alt="InstaPay logo"
          />
          <div>
            <strong>InstaPay</strong>
            <p>Real-time network for eligible banks and wallets.</p>
          </div>
        </div>
        {!Capacitor.isNativePlatform() && (
          <div className="transfer-method-row">
            <img
              className="transfer-method-logo"
              src="/bank-logos/pesonet.png"
              alt="PESONet logo"
            />
            <div>
              <strong>PESONet</strong>
              <p>Batch network for eligible bank transfers.</p>
            </div>
          </div>
        )}
      </section>
      <aside className="transfer-security-note">
        <ShieldCheck size={17} />
        <p>
          <strong>Review before sending</strong> Check the recipient and account
          details carefully. Do not share your MPIN.
        </p>
      </aside>
      <section className="transfer-activity-section">
        <header className="wallet-activity-heading">
          <div>
            <span className="eyebrow">MONEY OUT</span>
            <h2>Recent transfers</h2>
          </div>
          <span>{recentTransfers.length} shown</span>
        </header>
        {recentTransfers.length ? (
          <div className="transaction-list full-list">
            {recentTransfers.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onClick={() => onTransaction(transaction)}
              />
            ))}
          </div>
        ) : (
          <div className="wallet-empty-state transfer-empty-state">
            <Send size={22} />
            <strong>No transfers yet</strong>
            <p>Your outgoing transfers will appear here after you submit one.</p>
            <Button variant="secondary" onClick={onTransfer}>
              Start a transfer
            </Button>
          </div>
        )}
      </section>
    </section>
  )
}