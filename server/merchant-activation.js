export const MERCHANT_USDT_BALANCE_MILESTONE = 100

function toTokenUnits(value, decimals) {
  if (
    typeof value !== "string" ||
    !/^\d+(?:\.\d+)?$/.test(value) ||
    !Number.isInteger(decimals) ||
    decimals < 0
  ) {
    throw new Error("A valid token amount is required.")
  }
  const [whole, fraction = ""] = value.split(".")
  if (fraction.length > decimals) {
    throw new Error("Token amount has more decimal places than supported.")
  }
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  )
}

function fromTokenUnits(value, decimals) {
  const divisor = 10n ** BigInt(decimals)
  const whole = value / divisor
  const fraction = (value % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : String(whole)
}

export function getPostAssignmentUsdtBalance(
  currentBalance,
  balanceAtAssignment,
  decimals = 6,
) {
  if (currentBalance === null || balanceAtAssignment === null) return null
  const currentUnits = toTokenUnits(currentBalance, decimals)
  const assignedUnits = toTokenUnits(balanceAtAssignment, decimals)
  return fromTokenUnits(
    currentUnits > assignedUnits ? currentUnits - assignedUnits : 0n,
    decimals,
  )
}

export function meetsUsdtMinimumBalance(value) {
  return (
    value !== null &&
    toTokenUnits(value, 6) >=
      BigInt(MERCHANT_USDT_BALANCE_MILESTONE) * 10n ** 6n
  )
}

export function isMerchantFullyActivated({
  activationFeePaid,
  qualifyingUsdtBalance,
}) {
  return activationFeePaid && meetsUsdtMinimumBalance(qualifyingUsdtBalance)
}

export function isSinceAssignment(blockTimestamp, assignedAt) {
  const timestamp = Number(blockTimestamp)
  const assignmentTimestamp = new Date(assignedAt).getTime()
  return (
    Number.isFinite(timestamp) &&
    Number.isFinite(assignmentTimestamp) &&
    timestamp >= assignmentTimestamp
  )
}

export function isActivationGatedOperation(method, path) {
  return (
    (method === "POST" && path === "/disbursements") ||
    (method === "POST" && path === "/floating-balance/transfer-requests") ||
    (method === "POST" && path === "/api-keys") ||
    (method === "PUT" && path === "/webhook") ||
    (method === "POST" && /^\/webhook\/deliveries\/[^/]+\/retry$/.test(path))
  )
}
