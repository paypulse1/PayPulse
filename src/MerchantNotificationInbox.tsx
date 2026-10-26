import { useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  Inbox,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"
import {
  getMerchantNotificationInbox,
  markAllMerchantNotificationsRead,
  markMerchantNotificationRead,
  type MerchantNotification,
} from "./lib/swiftpay"

function formatNotificationAmount(notification: MerchantNotification) {
  const amount = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(notification.amount)
  return notification.type === "PAYMENT" ? `+${amount}` : `−${amount}`
}

function formatNotificationDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Date unavailable"
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export default function MerchantNotificationInbox({
  onUnreadCountChange,
}: {
  onUnreadCountChange: (count: number) => void
}) {
  const [notifications, setNotifications] = useState<MerchantNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [nextOffset, setNextOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState("")
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [error, setError] = useState("")
  const activeRef = useRef(true)

  async function loadInbox(offset = 0, append = false) {
    setLoading(true)
    setError("")
    try {
      const page = await getMerchantNotificationInbox({ limit: 20, offset })
      if (!activeRef.current) return
      setNotifications((current) =>
        append ? [...current, ...page.notifications] : page.notifications,
      )
      setUnreadCount(page.unreadCount)
      onUnreadCountChange(page.unreadCount)
      setHasMore(page.hasMore)
      setNextOffset(offset + page.notifications.length)
    } catch (requestError) {
      if (!activeRef.current) return
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load your notifications.",
      )
    } finally {
      if (activeRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    activeRef.current = true
    void loadInbox()
    return () => {
      activeRef.current = false
    }
  }, [])

  async function markRead(notification: MerchantNotification) {
    if (notification.readAt || updatingId || markingAllRead) return
    setUpdatingId(notification.id)
    setError("")
    try {
      const response = await markMerchantNotificationRead(notification.id)
      if (!activeRef.current) return
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: response.readAt }
            : item,
        ),
      )
      const nextCount = Math.max(0, unreadCount - 1)
      setUnreadCount(nextCount)
      onUnreadCountChange(nextCount)
    } catch (requestError) {
      if (!activeRef.current) return
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update this notification.",
      )
    } finally {
      if (activeRef.current) setUpdatingId("")
    }
  }

  async function markAllRead() {
    if (!unreadCount || markingAllRead || updatingId) return
    setMarkingAllRead(true)
    setError("")
    try {
      const response = await markAllMerchantNotificationsRead()
      if (!activeRef.current) return
      const readAt = new Date().toISOString()
      setNotifications((current) =>
        current.map((item) => (item.readAt ? item : { ...item, readAt })),
      )
      setUnreadCount(response.unreadCount)
      onUnreadCountChange(response.unreadCount)
    } catch (requestError) {
      if (!activeRef.current) return
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not mark notifications as read.",
      )
    } finally {
      if (activeRef.current) setMarkingAllRead(false)
    }
  }

  return (
    <div className="notification-inbox">
      <div className="notification-inbox-toolbar">
        <p>
          {unreadCount === 0
            ? "You’re all caught up."
            : `${unreadCount} unread notification${
                unreadCount === 1 ? "" : "s"
              }`}
        </p>
        <button
          type="button"
          className="notification-mark-all"
          disabled={!unreadCount || markingAllRead || Boolean(updatingId)}
          onClick={() => void markAllRead()}
        >
          {markingAllRead ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <CheckCheck size={14} />
          )}
          Mark all read
        </button>
      </div>
      {error && (
        <div className="inline-error notification-inbox-error" role="alert">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadInbox()}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      )}
      {loading && notifications.length === 0 ? (
        <div className="notification-inbox-state" role="status">
          <LoaderCircle className="spin" size={19} />
          Loading notifications…
        </div>
      ) : notifications.length === 0 ? (
        <div className="notification-inbox-state">
          <span className="notification-empty-icon">
            <Inbox size={22} />
          </span>
          <strong>No notifications yet</strong>
          <p>Payment and transfer updates will appear here.</p>
        </div>
      ) : (
        <div className="notification-inbox-list">
          {notifications.map((notification) => {
            const unread = !notification.readAt
            const updating = updatingId === notification.id
            return (
              <article
                className={`notification-inbox-item${
                  unread ? " is-unread" : ""
                }`}
                key={notification.id}
              >
                <span className="notification-icon">
                  {notification.type === "PAYMENT" ? (
                    <ArrowDownLeft size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </span>
                <div className="notification-inbox-content">
                  <div className="notification-inbox-heading">
                    <strong>{notification.title}</strong>
                    {unread && <span className="notification-new">New</span>}
                  </div>
                  <p>{notification.description}</p>
                  <strong className="notification-amount">
                    {formatNotificationAmount(notification)}
                  </strong>
                  <small>
                    Ref {notification.reference} ·{" "}
                    {formatNotificationDate(notification.createdAt)}
                  </small>
                </div>
                {unread && (
                  <button
                    type="button"
                    className="notification-read-button"
                    aria-label={`Mark ${notification.title.toLowerCase()} as read`}
                    title="Mark as read"
                    disabled={Boolean(updatingId) || markingAllRead}
                    onClick={() => void markRead(notification)}
                  >
                    {updating ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Check size={15} />
                    )}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          className="notification-load-more"
          disabled={loading}
          onClick={() => void loadInbox(nextOffset, true)}
        >
          {loading ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <RefreshCw size={14} />
          )}
          Load older notifications
        </button>
      )}
    </div>
  )
}
