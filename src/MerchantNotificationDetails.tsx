import { useEffect, useRef, useState } from "react"
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"
import {
  getMerchantActivityPage,
  type MerchantNotification,
  type Transaction,
} from "./lib/swiftpay"
import {
  findNotificationTransaction,
  formatNotificationDate,
  formatNotificationMoney,
  notificationReceiptText,
} from "./lib/notificationPresentation"
import TransferReceiptActions from "./TransferReceiptActions"

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Some embedded browsers disallow the Clipboard API. Try a selected field.
    }
  }
  const previousFocus = document.activeElement
  const field = document.createElement("textarea")
  field.value = value
  field.setAttribute("readonly", "")
  field.style.cssText = "position:fixed;left:-9999px;top:0"
  document.body.appendChild(field)
  field.select()
  try {
    if (
      typeof document.execCommand !== "function" ||
      !document.execCommand("copy")
    ) {
      throw new Error(
        "Copy is unavailable. Select and copy the reference below.",
      )
    }
  } finally {
    field.remove()
    if (previousFocus instanceof HTMLElement) previousFocus.focus()
  }
}

export default function MerchantNotificationDetails({
  notification,
  onBack,
  refreshVersion,
}: {
  notification: MerchantNotification
  onBack: () => void
  refreshVersion: number
}) {
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState("")
  const [version, setVersion] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    setTransaction(null)
    // Use the existing authenticated, read-only activity API. Do not infer a
    // current status from a historical notification's title.
    getMerchantActivityPage({ limit: 100 })
      .then((transactions) => {
        if (active) {
          setTransaction(
            findNotificationTransaction(notification, transactions),
          )
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load transaction details.",
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [notification, version, refreshVersion])

  async function copy(value: string, successMessage: string) {
    setFeedback("")
    try {
      await copyText(value)
      setFeedback(successMessage)
    } catch (copyError) {
      setFeedback(
        copyError instanceof Error ? copyError.message : "Could not copy.",
      )
    }
  }

  const payment = notification.type === "PAYMENT"
  const amount = transaction?.numericAmount ?? notification.amount
  const walletCredit =
    payment &&
    typeof transaction?.walletAmount === "number" &&
    Number.isFinite(transaction.walletAmount) &&
    transaction.walletAmount >= 0
      ? transaction.walletAmount
      : null

  return (
    <section
      className="notification-detail"
      aria-labelledby="notification-detail-title"
    >
      <button className="notification-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to notifications
      </button>
      <h3 id="notification-detail-title" ref={headingRef} tabIndex={-1}>
        {payment ? "Payment details" : "Transfer details"}
      </h3>
      <div className="notification-detail-hero">
        <span
          className={`notification-detail-symbol${
            payment ? " is-payment" : ""
          }`}
        >
          {payment ? <ArrowDownLeft size={25} /> : <ArrowUpRight size={25} />}
        </span>
        <p>{payment ? "Payment amount" : "Transfer amount"}</p>
        <strong>{formatNotificationMoney(amount)}</strong>
        {transaction ? (
          <span
            className={`notification-detail-status is-${transaction.status.toLowerCase()}`}
          >
            {transaction.status === "Completed" && (
              <CheckCircle2 size={15} aria-hidden="true" />
            )}
            {transaction.status}
          </span>
        ) : (
          <span className="notification-detail-status">
            {loading
              ? "Checking current status…"
              : "Current status unavailable"}
          </span>
        )}
        <p className="notification-detail-description">
          {notification.description}
        </p>
      </div>
      <dl className="notification-detail-facts">
        <div>
          <dt>Reference</dt>
          <dd className="notification-detail-reference">
            {notification.reference || "Not provided"}
          </dd>
        </div>
        <div>
          <dt>
            {transaction?.createdAt ? "Transaction date" : "Notification date"}
          </dt>
          <dd>
            {formatNotificationDate(
              transaction?.createdAt || notification.createdAt,
            )}
          </dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{payment ? "Payment" : "Transfer"}</dd>
        </div>
        {transaction && (
          <div>
            <dt>Provider status</dt>
            <dd>{transaction.rawStatus || "Not provided"}</dd>
          </div>
        )}
        {transaction?.channel && (
          <div>
            <dt>Channel</dt>
            <dd>{transaction.channel}</dd>
          </div>
        )}
        {transaction?.institutionName && (
          <div>
            <dt>Institution</dt>
            <dd>{transaction.institutionName}</dd>
          </div>
        )}
        {transaction?.recipientName && (
          <div>
            <dt>Recipient</dt>
            <dd>{transaction.recipientName}</dd>
          </div>
        )}
        {transaction?.recipientAccountNumber && (
          <div>
            <dt>Account ending</dt>
            <dd>{transaction.recipientAccountNumber.slice(-4)}</dd>
          </div>
        )}
        {walletCredit !== null && (
          <div>
            <dt>Wallet credit</dt>
            <dd>{formatNotificationMoney(walletCredit)}</dd>
          </div>
        )}
      </dl>
      {loading && (
        <p className="notification-detail-note" role="status">
          <LoaderCircle className="spin" size={16} /> Loading verified
          transaction details…
        </p>
      )}
      {!loading && !transaction && (
        <div className="notification-detail-note">
          <p>
            {error ||
              "This transaction was not found in your recent activity. Only the original notification information is shown. Check Wallet activity for older transactions."}
          </p>
          <button
            type="button"
            className="notification-back"
            onClick={() => setVersion((current) => current + 1)}
          >
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      )}
      <div className="notification-detail-actions">
        <button
          type="button"
          disabled={!notification.reference}
          onClick={() => void copy(notification.reference, "Reference copied.")}
        >
          <Copy size={17} aria-hidden="true" /> Copy reference
        </button>
        {transaction && (
          <>
            <button
              type="button"
              onClick={() =>
                void copy(
                  notificationReceiptText(notification, transaction),
                  "Receipt details copied.",
                )
              }
            >
              <Copy size={17} aria-hidden="true" /> Copy receipt details
            </button>
            <TransferReceiptActions
              className="notification-detail-receipt-actions"
              receipt={{
                amount: Math.abs(transaction.numericAmount),
                status: transaction.rawStatus,
                statusLabel: `${
                  payment ? "Payment" : "Transfer"
                } ${transaction.status.toLowerCase()}`,
                reference: transaction.reference,
                createdAt: transaction.createdAt,
                channel: transaction.channel,
                institutionName: transaction.institutionName,
                recipientName: transaction.recipientName,
                accountNumber: transaction.recipientAccountNumber,
                remarks: transaction.description,
              }}
            />
          </>
        )}
      </div>
      <p className="notification-detail-feedback" role="status">
        {feedback}
      </p>
    </section>
  )
}
