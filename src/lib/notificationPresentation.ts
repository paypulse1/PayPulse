import type { MerchantNotification, Transaction } from "./swiftpay"

export type NotificationFilter = "All" | "Unread" | "Payments" | "Transfers"

export function formatNotificationMoney(amount: number) {
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
      }).format(Math.abs(amount))
    : "Amount unavailable"
}

export function formatNotificationDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Date unavailable"
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function filterNotifications(
  notifications: MerchantNotification[],
  filter: NotificationFilter,
) {
  return notifications.filter((notification) => {
    if (filter === "Unread") return !notification.readAt
    if (filter === "Payments") return notification.type === "PAYMENT"
    if (filter === "Transfers") return notification.type === "DISBURSEMENT"
    return true
  })
}

export function groupNotifications(
  notifications: MerchantNotification[],
  now = new Date(),
) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const groups: {
    label: string
    notifications: MerchantNotification[]
  }[] = [
    { label: "Today", notifications: [] },
    { label: "Yesterday", notifications: [] },
    { label: "Earlier", notifications: [] },
  ]
  for (const notification of notifications) {
    const date = new Date(notification.createdAt)
    const localDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    )
    const group =
      localDay.getTime() === today.getTime()
        ? 0
        : localDay.getTime() === yesterday.getTime()
          ? 1
          : 2
    groups[group].notifications.push(notification)
  }
  return groups.filter((group) => group.notifications.length > 0)
}

export function findNotificationTransaction(
  notification: MerchantNotification,
  transactions: Transaction[],
) {
  if (!notification.reference.trim()) return null
  // Never join by amount, description, or title: they are not unique identifiers.
  const matches = transactions.filter(
    (transaction) =>
      transaction.reference === notification.reference &&
      Number.isFinite(transaction.numericAmount) &&
      (notification.type === "PAYMENT"
        ? transaction.numericAmount >= 0
        : transaction.numericAmount < 0),
  )
  return matches.length === 1 ? matches[0] : null
}

export function notificationReceiptText(
  notification: MerchantNotification,
  transaction: Transaction,
) {
  return [
    "PayPulse transaction receipt",
    notification.type === "PAYMENT" ? "Payment" : "Transfer",
    `Amount: ${formatNotificationMoney(transaction.numericAmount)}`,
    `Status: ${transaction.status} (${transaction.rawStatus})`,
    `Reference: ${transaction.reference}`,
    `Date: ${formatNotificationDate(transaction.createdAt || "")}`,
    transaction.channel ? `Channel: ${transaction.channel}` : "",
    transaction.description ? `Description: ${transaction.description}` : "",
    notification.type === "PAYMENT" &&
    typeof transaction.walletAmount === "number" &&
    Number.isFinite(transaction.walletAmount) &&
    transaction.walletAmount >= 0
      ? `Wallet credit: ${formatNotificationMoney(transaction.walletAmount)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}
