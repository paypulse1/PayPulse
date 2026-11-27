import assert from "node:assert/strict"
import { test } from "vitest"
import type { MerchantNotification, Transaction } from "./swiftpay"
import {
  filterNotifications,
  findNotificationTransaction,
  formatNotificationDate,
  formatNotificationMoney,
  groupNotifications,
  notificationReceiptText,
} from "./notificationPresentation"

const notification: MerchantNotification = {
  id: "notification",
  type: "PAYMENT",
  title: "Payment received",
  description: "Invoice",
  reference: "PAY-123",
  amount: 100,
  createdAt: "2026-05-12T10:00:00Z",
  readAt: null,
}
const transaction: Transaction = {
  id: "payment",
  customer: "Invoice",
  email: "Money received",
  initials: "PL",
  color: "blue",
  reference: "PAY-123",
  channel: "QR Ph checkout",
  date: "May 12",
  createdAt: "2026-05-12T09:00:00Z",
  status: "Completed",
  rawStatus: "EXECUTED",
  amount: "₱100.00",
  numericAmount: 100,
  walletAmount: 97,
  description: "Invoice",
}

test("notification filters preserve All and type filters and add Unread", () => {
  const transfer: MerchantNotification = {
    ...notification,
    id: "transfer",
    type: "DISBURSEMENT",
    readAt: "2026-05-12T11:00:00Z",
  }
  const rows = [notification, transfer]
  assert.deepEqual(filterNotifications(rows, "All"), rows)
  assert.deepEqual(filterNotifications(rows, "Unread"), [notification])
  assert.deepEqual(filterNotifications(rows, "Payments"), [notification])
  assert.deepEqual(filterNotifications(rows, "Transfers"), [transfer])
})

test("date grouping uses local calendar days, including month boundaries", () => {
  const now = new Date(2026, 2, 1, 12)
  const today = {
    ...notification,
    createdAt: new Date(2026, 2, 1, 0, 5).toISOString(),
  }
  const yesterday = {
    ...notification,
    id: "yesterday",
    createdAt: new Date(2026, 1, 28, 23, 59).toISOString(),
  }
  const earlier = {
    ...notification,
    id: "earlier",
    createdAt: new Date(2026, 1, 27, 12).toISOString(),
  }
  const invalid = { ...notification, id: "invalid", createdAt: "invalid" }
  assert.deepEqual(
    groupNotifications([today, yesterday, earlier, invalid], now),
    [
      { label: "Today", notifications: [today] },
      { label: "Yesterday", notifications: [yesterday] },
      { label: "Earlier", notifications: [earlier, invalid] },
    ],
  )
  assert.deepEqual(groupNotifications([], now), [])
})

test("details only join an exact, unambiguous reference and direction", () => {
  assert.equal(
    findNotificationTransaction(notification, [transaction]),
    transaction,
  )
  assert.equal(
    findNotificationTransaction(notification, [
      { ...transaction, reference: "OTHER" },
    ]),
    null,
  )
  assert.equal(
    findNotificationTransaction(notification, [
      { ...transaction, numericAmount: -100 },
    ]),
    null,
  )
  assert.equal(
    findNotificationTransaction(notification, [transaction, transaction]),
    null,
  )
  assert.equal(
    findNotificationTransaction({ ...notification, reference: "" }, [
      transaction,
    ]),
    null,
  )
  assert.equal(
    findNotificationTransaction(notification, [
      { ...transaction, numericAmount: Number.NaN },
    ]),
    null,
  )
  const transfer = { ...notification, type: "DISBURSEMENT" as const }
  const debit = { ...transaction, numericAmount: -100 }
  assert.equal(findNotificationTransaction(transfer, [debit]), debit)
})

test("receipt uses live status, actual gross amount and wallet credit without inventing a fee", () => {
  const receipt = notificationReceiptText(notification, transaction)
  assert.match(receipt, /Amount: ₱100\.00/)
  assert.match(receipt, /Status: Completed \(EXECUTED\)/)
  assert.match(receipt, /Wallet credit: ₱97\.00/)
  assert.doesNotMatch(receipt, /fee|net|recipient|account/i)
  assert.doesNotMatch(
    notificationReceiptText(notification, {
      ...transaction,
      walletAmount: null,
    }),
    /Wallet credit/,
  )
  assert.match(
    notificationReceiptText(notification, {
      ...transaction,
      status: "Failed",
      rawStatus: "REVERSED",
    }),
    /Status: Failed \(REVERSED\)/,
  )
  assert.doesNotMatch(
    notificationReceiptText(notification, { ...transaction, walletAmount: -3 }),
    /Wallet credit/,
  )
})

test("formatting does not render invalid data as zero or an invalid date", () => {
  assert.equal(formatNotificationMoney(Number.NaN), "Amount unavailable")
  assert.equal(formatNotificationDate("invalid"), "Date unavailable")
  assert.match(formatNotificationMoney(-125), /₱125\.00/)
})
