import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  Search,
  WalletCards,
} from "lucide-react"
import { Button } from "./AppPrimitives"
import { TransactionRow } from "./MerchantDashboardPrimitives"
import {
  getMerchantActivityPage,
  type DashboardData,
  type Transaction,
} from "./lib/swiftpay"
import useBalanceVisibility from "./useBalanceVisibility"

const WALLET_ACTIVITY_FILTERS = [
  "All activity",
  "Money in",
  "Money out",
  "Completed",
  "Pending",
  "Failed",
]

type WalletBalancePanelProps = {
  data: DashboardData
  balanceVisible: boolean
  onToggleBalanceVisibility: () => void
  onWithdraw: () => void
}

type WalletFloatingBalanceCardProps = {
  data: DashboardData
  balanceVisible: boolean
  refreshVersion: number
}

export default function WalletScreen({
  data,
  refreshVersion,
  onWithdraw,
  onTransaction,
  onExportActivity,
  subscreen,
  onOpenSubscreen,
  onCloseSubscreen,
  renderBalancePanel,
  renderUsdtWallet,
  renderUnsettledBalanceCard,
}: {
  data: DashboardData
  refreshVersion: number
  onWithdraw: () => void
  onTransaction: (transaction: Transaction) => void
  onExportActivity: (fromDate: string, toDate: string) => void
  subscreen: "overview" | "usdt" | "unsettled-balance"
  onOpenSubscreen: (subscreen: "usdt" | "unsettled-balance") => void
  onCloseSubscreen: () => void
  renderBalancePanel: (props: WalletBalancePanelProps) => ReactNode
  renderUsdtWallet: (refreshVersion: number) => ReactNode
  renderUnsettledBalanceCard: (
    props: WalletFloatingBalanceCardProps,
  ) => ReactNode
}) {
  const [filter, setFilter] = useState("All activity")
  const [query, setQuery] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [activity, setActivity] = useState(data.transactions)
  const [activityHasMore, setActivityHasMore] = useState(
    data.transactions.length === 50,
  )
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState("")
  const { balanceVisible, toggleBalanceVisibility } = useBalanceVisibility()

  useEffect(() => {
    if (!fromDate && !toDate) {
      setActivity(data.transactions)
      setActivityHasMore(data.transactions.length === 50)
      setActivityError("")
      setActivityLoading(false)
      return
    }

    let active = true
    setActivityLoading(true)
    setActivityError("")
    getMerchantActivityPage({
      limit: 50,
      offset: 0,
      from: fromDate,
      to: toDate,
    })
      .then((page) => {
        if (!active) return
        setActivity(page)
        setActivityHasMore(page.length === 50)
      })
      .catch((loadError) => {
        if (active)
          setActivityError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load wallet activity.",
          )
      })
      .finally(() => {
        if (active) setActivityLoading(false)
      })
    return () => {
      active = false
    }
  }, [fromDate, toDate, data.transactions])

  async function loadMoreActivity() {
    setActivityLoading(true)
    setActivityError("")
    try {
      const page = await getMerchantActivityPage({
        limit: 50,
        offset: activity.length,
        from: fromDate,
        to: toDate,
      })
      setActivity((current) => [...current, ...page])
      setActivityHasMore(page.length === 50)
    } catch (loadError) {
      setActivityError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load more wallet activity.",
      )
    } finally {
      setActivityLoading(false)
    }
  }

  const transactions = useMemo(
    () =>
      activity.filter((item) => {
        const matchesFilter =
          filter === "All activity" ||
          (filter === "Money in" &&
            (item.walletAmount ?? item.numericAmount) > 0) ||
          (filter === "Money out" &&
            (item.walletAmount ?? item.numericAmount) < 0) ||
          item.status === filter
        const matchesQuery =
          `${item.reference} ${item.customer} ${item.description}`
            .toLowerCase()
            .includes(query.toLowerCase())
        return matchesFilter && matchesQuery
      }),
    [activity, filter, query],
  )

  if (subscreen === "usdt") {
    return (
      <section className="wallet-page wallet-usdt-page">
        <Button
          variant="quiet"
          icon={<ChevronLeft size={17} />}
          onClick={onCloseSubscreen}
        >
          Back to Wallet
        </Button>
        <div className="wallet-subpage-heading crypto-wallet-page-heading">
          <span className="eyebrow">TRON · TRC20</span>
          <h2>USDT wallet</h2>
          <p>View your balance, receive USDT, and manage transfer requests.</p>
        </div>
        {renderUsdtWallet(refreshVersion)}
      </section>
    )
  }

  if (subscreen === "unsettled-balance") {
    return (
      <section className="wallet-page wallet-unsettled-page">
        <Button
          variant="quiet"
          icon={<ChevronLeft size={17} />}
          onClick={onCloseSubscreen}
        >
          Back to Wallet
        </Button>
        <div className="wallet-subpage-heading">
          <span className="eyebrow">WALLET</span>
          <h2>Unsettled Funds</h2>
          <p>
            Track your Alipay+ collection threshold for transferring unsettled
            funds to your live DRPAY PHP wallet.
          </p>
        </div>
        {renderUnsettledBalanceCard({ data, balanceVisible, refreshVersion })}
      </section>
    )
  }

  return (
    <section className="wallet-page">
      {renderBalancePanel({
        data,
        balanceVisible,
        onToggleBalanceVisibility: toggleBalanceVisibility,
        onWithdraw,
      })}
      <WalletActionGrid
        onWithdraw={onWithdraw}
        onOpenSubscreen={onOpenSubscreen}
      />
      <WalletActivitySection
        transactions={transactions}
        totalTransactions={activity.length}
        filter={filter}
        query={query}
        fromDate={fromDate}
        toDate={toDate}
        hasMore={activityHasMore}
        loadingMore={activityLoading}
        activityError={activityError}
        onExport={onExportActivity}
        onFilterChange={setFilter}
        onQueryChange={setQuery}
        onDateChange={(key, value) => {
          if (key === "from") setFromDate(value)
          else setToDate(value)
        }}
        onLoadMore={() => void loadMoreActivity()}
        onTransaction={onTransaction}
      />
    </section>
  )
}

function WalletActionGrid({
  onWithdraw,
  onOpenSubscreen,
}: {
  onWithdraw: () => void
  onOpenSubscreen: (subscreen: "usdt" | "unsettled-balance") => void
}) {
  const actions = [
    {
      label: "Transfer PHP",
      description: "Send to a bank or wallet",
      icon: ArrowLeftRight,
      onClick: onWithdraw,
      iconClassName: "",
    },
    {
      label: "Unsettled funds",
      description: "View balance and request payout",
      icon: Clock3,
      onClick: () => onOpenSubscreen("unsettled-balance"),
      iconClassName: "",
    },
    {
      label: "USDT wallet",
      description: "Receive and transfer crypto",
      icon: Coins,
      onClick: () => onOpenSubscreen("usdt"),
      iconClassName: "wallet-action-icon-crypto",
    },
  ]

  return (
    <section className="wallet-action-grid" aria-label="Wallet actions">
      {actions.map(
        ({ label, description, icon: Icon, onClick, iconClassName }) => (
          <button
            key={label}
            type="button"
            className="wallet-action-card"
            onClick={onClick}
          >
            <span className={`wallet-action-icon ${iconClassName}`}>
              <Icon size={19} aria-hidden="true" />
            </span>
            <span className="wallet-action-copy">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ),
      )}
    </section>
  )
}

function WalletActivitySection({
  transactions,
  totalTransactions,
  filter,
  query,
  fromDate,
  toDate,
  hasMore,
  loadingMore,
  activityError,
  onExport,
  onFilterChange,
  onQueryChange,
  onDateChange,
  onLoadMore,
  onTransaction,
}: {
  transactions: Transaction[]
  totalTransactions: number
  filter: string
  query: string
  fromDate: string
  toDate: string
  hasMore: boolean
  loadingMore: boolean
  activityError: string
  onExport: (fromDate: string, toDate: string) => void
  onFilterChange: (filter: string) => void
  onQueryChange: (query: string) => void
  onDateChange: (key: "from" | "to", value: string) => void
  onLoadMore: () => void
  onTransaction: (transaction: Transaction) => void
}) {
  return (
    <>
      <header className="wallet-activity-heading">
        <div>
          <span className="eyebrow">MERCHANT ACTIVITY</span>
          <h2>Wallet activity</h2>
        </div>
        <span>{transactions.length} shown</span>
        <button
          type="button"
          className="text-button"
          onClick={() => onExport(fromDate, toDate)}
        >
          Export date-range CSV
        </button>
      </header>
      <label className="activity-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search description or reference"
          aria-label="Search wallet activity"
        />
      </label>
      <div className="wallet-date-filters" aria-label="Filter activity by date">
        <label>
          <span>From</span>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => onDateChange("from", event.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => onDateChange("to", event.target.value)}
          />
        </label>
      </div>
      <div className="filter-row">
        {WALLET_ACTIVITY_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            className={filter === item ? "active" : ""}
            onClick={() => onFilterChange(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="transaction-list full-list">
        {transactions.length > 0 ? (
          transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onClick={() => onTransaction(transaction)}
            />
          ))
        ) : (
          <div className="wallet-empty-state">
            <WalletCards size={23} />
            <strong>
              {totalTransactions
                ? "No matching activity"
                : "No wallet activity yet"}
            </strong>
            <p>
              {totalTransactions
                ? "Try a different filter or search term."
                : "Incoming payments and outgoing transfers will appear here."}
            </p>
          </div>
        )}
      </div>
      {activityError && (
        <p className="inline-error" role="alert">
          {activityError}
        </p>
      )}
      {hasMore && (
        <Button variant="secondary" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "Loading…" : "Load more activity"}
        </Button>
      )}
    </>
  )
}
