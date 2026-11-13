const financeActions = [
  /^\/v1\/admin\/payment-links\/[^/]+\/mark-paid$/,
  /^\/v1\/admin\/merchants\/[^/]+\/wallet\/adjustments$/,
  /^\/v1\/admin\/internal-wallets\/[^/]+\/adjustments$/,
  /^\/v1\/admin\/floating-transfer-requests\/[^/]+\/(successful|failed)$/,
  /^\/v1\/admin\/crypto\/usdt-withdrawals\/[^/]+\/(completed|rejected)$/,
  /^\/v1\/admin\/reconciliation\/(bank-csv|swiftpay\/scan)$/,
  /^\/v1\/admin\/reconciliation\/suspense\/[^/]+\/(claim|resolve)$/,
]

const complianceActions = [
  /^\/v1\/admin\/kyb(?:\/|$)/,
  /^\/v1\/admin\/merchants\/[^/]+\/kyb(?:\/|$)/,
  /^\/v1\/admin\/merchant-registrations(?:\/|$)/,
  /^\/v1\/admin\/sumsub(?:\/|$)/,
]
const complianceReadOnlyData = [
  /^\/v1\/admin\/kyb(?:\/|$)/,
  /^\/v1\/admin\/merchant-registrations(?:\/|$)/,
  /^\/v1\/admin\/sumsub(?:\/|$)/,
]

export function canAdminAccess(role, method, path) {
  if (role === "super_admin") return true
  if (path.startsWith("/v1/admin/staff")) return false
  if (method === "GET" || method === "HEAD") {
    if (
      role === "finance" &&
      complianceReadOnlyData.some((pattern) => pattern.test(path))
    ) {
      return false
    }
    return ["finance", "compliance", "auditor"].includes(role)
  }
  if (method === "POST" && path.startsWith("/v1/admin/approval-requests/")) {
    return ["finance", "compliance"].includes(role)
  }
  if (role === "finance") {
    return financeActions.some((pattern) => pattern.test(path))
  }
  if (role === "compliance") {
    return complianceActions.some((pattern) => pattern.test(path))
  }
  return false
}
