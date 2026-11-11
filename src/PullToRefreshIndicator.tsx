import { RefreshCw } from "lucide-react"
import { PULL_TO_REFRESH_THRESHOLD } from "./usePullToRefresh"

export default function PullToRefreshIndicator({
  distance,
  refreshing,
  variant = "default",
}: {
  distance: number
  refreshing: boolean
  variant?: "default" | "admin"
}) {
  if (distance <= 0 && !refreshing) return null

  const label = refreshing
    ? "Refreshing…"
    : distance >= PULL_TO_REFRESH_THRESHOLD
      ? "Release to refresh"
      : "Pull to refresh"

  if (variant === "admin") {
    return (
      <div className="admin-pull-refresh" role="status" aria-live="polite">
        {label}
      </div>
    )
  }

  return (
    <div className="pull-refresh-indicator" role="status" aria-live="polite">
      <span
        className={refreshing ? "is-refreshing" : ""}
        style={{
          transform: `translateY(${refreshing ? 0 : distance - 38}px)`,
        }}
      >
        <RefreshCw size={15} />
      </span>
      <small>{label}</small>
    </div>
  )
}
