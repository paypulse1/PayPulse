type UsdtStatusValue =
  | "CONFIRMED"
  | "PENDING"
  | "COMPLETED"
  | "REJECTED"

const statusLabels: Record<UsdtStatusValue, string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Pending",
  COMPLETED: "Payout sent",
  REJECTED: "Rejected",
}

export default function UsdtStatus({
  status,
  context,
}: {
  status: UsdtStatusValue
  context: "deposit" | "withdrawal"
}) {
  const label =
    context === "withdrawal" && status === "PENDING"
      ? "Awaiting review"
      : statusLabels[status]
  const accessibleLabel =
    context === "deposit"
      ? status === "CONFIRMED"
        ? "Deposit confirmed"
        : "Deposit pending"
      : status === "PENDING"
        ? "Withdrawal awaiting review"
        : status === "COMPLETED"
          ? "Withdrawal payout sent"
          : "Withdrawal rejected"

  return (
    <span
      className={`crypto-usdt-status crypto-usdt-status-${status.toLowerCase()}`}
      aria-label={accessibleLabel}
    >
      {label}
    </span>
  )
}
