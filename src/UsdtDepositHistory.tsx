import type { MerchantUsdtDeposit } from "./lib/swiftpay"

export default function UsdtDepositHistory({
  deposits,
  loading,
  error,
  message,
}: {
  deposits: MerchantUsdtDeposit[]
  loading: boolean
  error: string
  message: string
}) {
  return (
    <section
      className="crypto-deposit-history"
      aria-label="USDT deposit history"
      aria-busy={loading}
    >
      <header className="section-header">
        <div>
          <span className="eyebrow">TRON · TRC20</span>
          <h3>Recent USDT deposits</h3>
        </div>
      </header>
      {loading ? (
        <p className="crypto-wallet-feedback" role="status">
          Loading confirmed deposits…
        </p>
      ) : error ? (
        <p className="crypto-wallet-feedback crypto-wallet-error" role="alert">
          {error}
        </p>
      ) : deposits.length ? (
        <div className="crypto-deposit-list">
          {deposits.map((deposit) => (
            <article
              className="crypto-deposit-row"
              key={deposit.transactionId}
            >
              <div>
                <strong>{deposit.amount} USDT</strong>
                <time dateTime={deposit.blockTimestamp}>
                  {new Date(deposit.blockTimestamp).toLocaleString()}
                </time>
                <small>From {deposit.from}</small>
              </div>
              <span
                className={`crypto-wallet-badge ${
                  deposit.confirmed ? "" : "pending"
                }`}
              >
                {deposit.confirmed ? "CONFIRMED" : "PENDING"}
              </span>
              <a
                href={`https://tronscan.org/#/transaction/${encodeURIComponent(deposit.transactionId)}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="crypto-wallet-feedback" role="status">
          {message ||
            "No confirmed USDT deposits found since this address was assigned."}
        </p>
      )}
    </section>
  )
}
