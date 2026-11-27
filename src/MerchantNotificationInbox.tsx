import { useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
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
import {
  filterNotifications,
  formatNotificationDate,
  formatNotificationMoney,
  groupNotifications,
  type NotificationFilter,
} from "./lib/notificationPresentation"
import PullToRefreshIndicator from "./PullToRefreshIndicator"
import MerchantNotificationDetails from "./MerchantNotificationDetails"

export default function MerchantNotificationInbox({
  onUnreadCountChange,
  refreshVersion,
  pullDistance,
  pullRefreshing,
}: {
  onUnreadCountChange: (count: number) => void
  refreshVersion: number
  pullDistance: number
  pullRefreshing: boolean
}) {
  const [filter, setFilter] = useState<NotificationFilter>("All")
  const [notifications, setNotifications] = useState<MerchantNotification[]>([])
  const [selected, setSelected] = useState<MerchantNotification | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [nextOffset, setNextOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState("")
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [error, setError] = useState("")
  const activeRef = useRef(false)
  const generationRef = useRef(0)
  const queueRef = useRef(Promise.resolve())
  const mutationRef = useRef(false)
  const unreadRef = useRef(0)
  const callbackRef = useRef(onUnreadCountChange)
  const returnFocusRef = useRef<HTMLButtonElement | null>(null)
  const inboxRef = useRef<HTMLDivElement>(null)
  callbackRef.current = onUnreadCountChange

  function publishUnread(count: number) {
    unreadRef.current = count
    setUnreadCount(count)
    callbackRef.current(count)
  }

  // Serialize reads and writes so an older page cannot undo a successful read
  // mutation. The generation also rejects responses from a previous refresh.
  function enqueue(operation: () => Promise<void>) {
    queueRef.current = queueRef.current.then(operation, operation)
    return queueRef.current
  }

  function loadInbox(
    offset = 0,
    append = false,
    generation = generationRef.current,
  ) {
    setLoading(true)
    setError("")
    return enqueue(async () => {
      if (!activeRef.current || generation !== generationRef.current) return
      try {
        const page = await getMerchantNotificationInbox({ limit: 20, offset })
        if (!activeRef.current || generation !== generationRef.current) return
        setNotifications((current) =>
          append
            ? [
                ...new Map(
                  [...current, ...page.notifications].map((item) => [
                    item.id,
                    item,
                  ]),
                ).values(),
              ]
            : page.notifications,
        )
        publishUnread(page.unreadCount)
        setHasMore(page.hasMore)
        setNextOffset(offset + page.notifications.length)
      } catch (requestError) {
        if (!activeRef.current || generation !== generationRef.current) return
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load your notifications.",
        )
      } finally {
        if (activeRef.current && generation === generationRef.current)
          setLoading(false)
      }
    })
  }

  useEffect(() => {
    activeRef.current = true
    const generation = ++generationRef.current
    void loadInbox(0, false, generation)
    return () => {
      activeRef.current = false
      ++generationRef.current
    }
  }, [refreshVersion])

  function markRead(notification: MerchantNotification) {
    if (notification.readAt || mutationRef.current) return
    mutationRef.current = true
    setUpdatingId(notification.id)
    setError("")
    return enqueue(async () => {
      if (!activeRef.current) {
        mutationRef.current = false
        return
      }
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
        publishUnread(Math.max(0, unreadRef.current - 1))
      } catch (requestError) {
        if (activeRef.current) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not update this notification.",
          )
        }
      } finally {
        mutationRef.current = false
        if (activeRef.current) setUpdatingId("")
      }
    })
  }

  function markAllRead() {
    if (!unreadRef.current || mutationRef.current) return
    mutationRef.current = true
    setMarkingAllRead(true)
    setError("")
    return enqueue(async () => {
      if (!activeRef.current) {
        mutationRef.current = false
        return
      }
      try {
        const response = await markAllMerchantNotificationsRead()
        if (!activeRef.current) return
        const readAt = new Date().toISOString()
        setNotifications((current) =>
          current.map((item) => (item.readAt ? item : { ...item, readAt })),
        )
        publishUnread(response.unreadCount)
      } catch (requestError) {
        if (activeRef.current) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not mark notifications as read.",
          )
        }
      } finally {
        mutationRef.current = false
        if (activeRef.current) setMarkingAllRead(false)
      }
    })
  }

  function backToInbox() {
    setSelected(null)
    requestAnimationFrame(() => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus()
      inboxRef.current
        ?.querySelector<HTMLButtonElement>(
          ".notification-inbox-filters button.active",
        )
        ?.focus()
    })
  }

  const filteredNotifications = filterNotifications(notifications, filter)
  const groups = groupNotifications(filteredNotifications)
  const busy = loading || markingAllRead || Boolean(updatingId)

  return (
    <div className="notification-inbox" ref={inboxRef}>
      <PullToRefreshIndicator
        distance={pullDistance}
        refreshing={pullRefreshing}
      />
      {error && (
        <div className="inline-error notification-inbox-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadInbox()}
          >
            Refresh inbox
          </button>
        </div>
      )}
      {selected ? (
        <MerchantNotificationDetails
          notification={selected}
          onBack={backToInbox}
          refreshVersion={refreshVersion}
        />
      ) : (
        <>
          <div className="notification-inbox-toolbar">
            <p aria-live="polite">
              {loading && notifications.length === 0
                ? "Checking for updates…"
                : error && notifications.length === 0
                  ? "Updates are temporarily unavailable."
                  : unreadCount === 0
                    ? "You’re all caught up."
                    : `${unreadCount} unread notification${
                        unreadCount === 1 ? "" : "s"
                      }`}
            </p>
            <button
              type="button"
              className="notification-mark-all"
              disabled={!unreadCount || busy}
              onClick={() => void markAllRead()}
            >
              {markingAllRead ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <CheckCheck size={16} />
              )}
              Mark all read
            </button>
          </div>
          <div
            className="notification-inbox-filters"
            aria-label="Filter notifications"
          >
            {(["All", "Unread", "Payments", "Transfers"] as const).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={filter === item}
                  className={filter === item ? "active" : ""}
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ),
            )}
          </div>
          {loading && notifications.length === 0 ? (
            <div className="notification-inbox-state" role="status">
              <LoaderCircle className="spin" size={20} />
              Loading notifications…
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="notification-inbox-state" role="status">
              <span className="notification-empty-icon">
                <Inbox size={24} />
              </span>
              <strong>
                {error
                  ? "Notifications unavailable"
                  : filter === "Unread"
                    ? unreadCount === 0
                      ? "You’re all caught up"
                      : "No unread updates loaded"
                    : filter === "All"
                      ? "No notifications yet"
                      : `No ${filter.toLowerCase()} notifications`}
              </strong>
              <p>
                {error
                  ? "Use Refresh inbox to try again."
                  : hasMore
                    ? "Load older notifications to check for more updates."
                    : filter === "Unread"
                      ? "Your unread updates will appear here."
                      : "Payment and transfer updates will appear here."}
              </p>
            </div>
          ) : (
            <div className="notification-inbox-list">
              {groups.map((group) => (
                <section
                  className="notification-inbox-group"
                  key={group.label}
                  aria-label={group.label}
                >
                  <h3>{group.label}</h3>
                  {group.notifications.map((notification) => (
                    <article
                      className={`notification-inbox-item${
                        !notification.readAt ? " is-unread" : ""
                      }`}
                      key={notification.id}
                    >
                      <button
                        type="button"
                        className="notification-open"
                        disabled={busy}
                        onClick={(event) => {
                          returnFocusRef.current = event.currentTarget
                          setSelected(notification)
                          void markRead(notification)
                        }}
                        aria-label={`View details: ${notification.title}, ${formatNotificationMoney(notification.amount)}, reference ${notification.reference}${
                          !notification.readAt ? ", unread" : ""
                        }`}
                      >
                        <span
                          className={`notification-icon${
                            notification.type === "PAYMENT" ? " is-payment" : ""
                          }`}
                        >
                          {notification.type === "PAYMENT" ? (
                            <ArrowDownLeft size={20} />
                          ) : (
                            <ArrowUpRight size={20} />
                          )}
                        </span>
                        <span className="notification-inbox-content">
                          <span className="notification-inbox-heading">
                            <strong>{notification.title}</strong>
                            {!notification.readAt && (
                              <span className="notification-new">New</span>
                            )}
                          </span>
                          <span className="notification-description">
                            {notification.description}
                          </span>
                          <strong className="notification-amount">
                            {formatNotificationMoney(notification.amount)}
                          </strong>
                          <small>
                            <span>Ref </span>
                            <span>{notification.reference}</span> ·{" "}
                            {formatNotificationDate(notification.createdAt)}
                          </small>
                        </span>
                        <ChevronRight
                          className="notification-chevron"
                          size={17}
                          aria-hidden="true"
                        />
                      </button>
                      {!notification.readAt && (
                        <button
                          type="button"
                          className="notification-read-button"
                          aria-label={`Mark ${notification.title.toLowerCase()} as read`}
                          title="Mark as read"
                          disabled={busy}
                          onClick={() => void markRead(notification)}
                        >
                          {updatingId === notification.id ? (
                            <LoaderCircle className="spin" size={17} />
                          ) : (
                            <Check size={17} />
                          )}
                        </button>
                      )}
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              className="notification-load-more"
              disabled={busy}
              onClick={() => void loadInbox(nextOffset, true)}
            >
              {loading ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              Load older notifications
            </button>
          )}
        </>
      )}
    </div>
  )
}
