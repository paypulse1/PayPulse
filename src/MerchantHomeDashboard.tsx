import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import MenuIcon, { type MenuIconKind, type MenuIconTone } from "./MenuIcon"
import {
  getMerchantActivityTrend,
  type DashboardData,
  type MerchantActivityTrendPoint,
  type Transaction,
} from "./lib/swiftpay"
import useBalanceVisibility from "./useBalanceVisibility"
import {
  AvailableBalanceCard,
  formatPeso,
  TransactionRow,
} from "./MerchantDashboardPrimitives"

export default function MerchantHomeDashboard({
  data,
  refreshVersion,
  onRequestPayment,
  onTransfer,
  onScan,
  onActivity,
  onCrypto,
  onPendings,
  onAllAccess,
  onTransaction,
}: {
  data: DashboardData
  refreshVersion: number
  onRequestPayment: () => void
  onTransfer: () => void
  onScan: () => void
  onActivity: () => void
  onCrypto: () => void
  onPendings: () => void
  onAllAccess: () => void
  onTransaction: (transaction: Transaction) => void
}) {
  const { balanceVisible, toggleBalanceVisibility } = useBalanceVisibility()

  return (
    <>
      <AvailableBalanceCard
        data={data}
        balanceVisible={balanceVisible}
        onToggleBalanceVisibility={toggleBalanceVisibility}
      />

      <section className="quick-actions" aria-label="Quick actions">
        <QuickAction
          icon="collect"
          tone="payments"
          label="Collect"
          onClick={onRequestPayment}
        />
        <QuickAction
          icon="transfer"
          tone="payments"
          label="Transfer"
          onClick={onTransfer}
        />
        <QuickAction
          icon="scan"
          tone="payments"
          label="Scan QR"
          onClick={onScan}
        />
        <QuickAction
          icon="activity"
          tone="overview"
          label="Activity"
          onClick={onActivity}
        />
        <QuickAction
          icon="crypto"
          tone="account"
          label="Crypto"
          onClick={onCrypto}
        />
        <QuickAction
          icon="pending"
          tone="overview"
          label="Pendings"
          onClick={onPendings}
        />
        <QuickAction
          icon="allAccess"
          tone="business"
          label="All access"
          onClick={onAllAccess}
        />
      </section>

      <section className="summary-card">
        <header className="section-header">
          <div>
            <span className="eyebrow">RECENT WALLET ACTIVITY</span>
            <h2>Money Movement</h2>
          </div>
          <button type="button" className="period-button">
            Latest 50 <ChevronDown size={14} />
          </button>
        </header>
        <div className="summary-grid">
          <div>
            <span>Incoming payments</span>
            <strong>{data.grossVolume}</strong>
          </div>
          <div>
            <span>Completed payments</span>
            <strong>{data.successfulPayments}</strong>
          </div>
        </div>
        <div className="average-row">
          <span>Average Completed Payment</span>
          <strong>{data.averageTransaction}</strong>
        </div>
      </section>

      <MerchantActivityChart refreshVersion={refreshVersion} />

      <section className="activity-section">
        <header className="section-header">
          <div>
            <span className="eyebrow">ACTIVITY</span>
            <h2>Recent Activity</h2>
          </div>
          <button type="button" className="text-button" onClick={onActivity}>
            See all
          </button>
        </header>
        <div className="transaction-list">
          {data.transactions.slice(0, 4).map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onClick={() => onTransaction(transaction)}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function QuickAction({
  icon,
  tone,
  label,
  onClick,
}: {
  icon: MenuIconKind
  tone: MenuIconTone
  label: string
  onClick?: () => void
}) {
  return (
    <button type="button" className="quick-action" onClick={onClick}>
      <span className="quick-action-icon" data-tone={tone}>
        <MenuIcon kind={icon} tone={tone} size={22} />
      </span>
      <strong>{label}</strong>
    </button>
  )
}

function MerchantActivityChart({ refreshVersion }: { refreshVersion: number }) {
  const [points, setPoints] = useState<MerchantActivityTrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const requestInFlight = useRef(false)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      if (requestInFlight.current) return
      requestInFlight.current = true
      try {
        const result = await getMerchantActivityTrend()
        if (active) {
          setPoints(result)
          setError("")
          setUpdatedAt(new Date())
        }
      } catch (requestError) {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load activity.",
          )
      } finally {
        requestInFlight.current = false
        if (active) setLoading(false)
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 10_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [refreshVersion])

  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.collections, point.transfers]),
  )
  const chartHeight = 150
  const chartTop = 12
  const chartBottom = 124
  const chartLeft = 44
  const chartRight = 360
  const yFor = (value: number) =>
    chartBottom - (value / maxValue) * (chartBottom - chartTop)
  const xFor = (index: number) =>
    chartLeft +
    (index * (chartRight - chartLeft)) / Math.max(points.length - 1, 1)
  const seriesPath = (field: "collections" | "transfers") =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point[field])}`,
      )
      .join(" ")
  const hasActivity = points.some(
    (point) => point.collections > 0 || point.transfers > 0,
  )
  const formatAxisValue = (value: number) =>
    value >= 1000
      ? `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
      : `₱${Math.round(value)}`

  return (
    <section
      className="merchant-trend-card"
      aria-labelledby="merchant-trend-title"
    >
      <header className="section-header">
        <div>
          <span className="eyebrow">LAST 7 DAYS</span>
          <h2 id="merchant-trend-title">Collections & Transfers</h2>
        </div>
        <span className="merchant-trend-live">
          <i /> LIVE · 10 SEC
        </span>
      </header>
      {loading && points.length === 0 ? (
        <p className="merchant-trend-message">Loading activity…</p>
      ) : error && points.length === 0 ? (
        <div
          className="merchant-trend-message merchant-trend-error"
          role="status"
        >
          <span>{error} Pull down to try again.</span>
        </div>
      ) : (
        <>
          <div className="merchant-trend-legend">
            <span>
              <i className="merchant-trend-collection-dot" /> Collections
            </span>
            <span>
              <i className="merchant-trend-transfer-dot" /> Transfers
            </span>
          </div>
          <svg
            className="merchant-trend-svg"
            viewBox={`0 0 380 ${chartHeight}`}
            role="img"
            aria-label="Successful collections and transfers by day over the last seven days"
          >
            {[0, 0.5, 1].map((fraction) => {
              const y = chartBottom - fraction * (chartBottom - chartTop)
              return (
                <g key={fraction}>
                  <line
                    x1={chartLeft}
                    x2={chartRight}
                    y1={y}
                    y2={y}
                    className="merchant-trend-gridline"
                  />
                  <text
                    x={chartLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="merchant-trend-axis"
                  >
                    {formatAxisValue(maxValue * fraction)}
                  </text>
                </g>
              )
            })}
            {points.length > 0 && (
              <>
                <path
                  d={seriesPath("collections")}
                  className="merchant-trend-line merchant-trend-collection-line"
                />
                <path
                  d={seriesPath("transfers")}
                  className="merchant-trend-line merchant-trend-transfer-line"
                />
                {points.map((point, index) => (
                  <g key={point.date}>
                    <circle
                      cx={xFor(index)}
                      cy={yFor(point.collections)}
                      r="3"
                      className="merchant-trend-collection-point"
                    >
                      <title>{`${point.date}: collections ${formatPeso(point.collections)}`}</title>
                    </circle>
                    <circle
                      cx={xFor(index)}
                      cy={yFor(point.transfers)}
                      r="3"
                      className="merchant-trend-transfer-point"
                    >
                      <title>{`${point.date}: transfers ${formatPeso(point.transfers)}`}</title>
                    </circle>
                    <text
                      x={xFor(index)}
                      y={chartBottom + 18}
                      textAnchor="middle"
                      className="merchant-trend-axis"
                    >
                      {new Date(`${point.date}T00:00:00`).toLocaleDateString(
                        "en-PH",
                        { day: "numeric", month: "short" },
                      )}
                    </text>
                  </g>
                ))}
              </>
            )}
          </svg>
          {!hasActivity && (
            <p className="merchant-trend-empty">
              No successful collections or transfers in this period.
            </p>
          )}
          <div className="merchant-trend-updated">
            {error
              ? `Update failed: ${error}`
              : updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`
                : ""}
          </div>
        </>
      )}
    </section>
  )
}
