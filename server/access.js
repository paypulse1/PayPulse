const apiKeyReadPaths = new Set([
  "/wallet/balance",
  "/wallet/activity",
  "/internal-wallet",
  "/crypto/usdt-wallet",
  "/crypto/usdt-deposits",
  "/disbursement-institutions",
  "/payment-institutions",
])

export function getBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
  return match ? match[1] : null
}

export function isMerchantSession(payload) {
  return (
    typeof payload?.sub === "string" &&
    payload.sub.length > 0 &&
    payload.role === "merchant"
  )
}

export function isOperationsSession(payload, configuredEmail) {
  return (
    typeof configuredEmail === "string" &&
    payload?.sub === configuredEmail &&
    payload?.role === "super_admin"
  )
}

export function hasApiKeyPermission(method, path, scopes) {
  if (method === "GET") {
    return (
      scopes.includes("read") &&
      (apiKeyReadPaths.has(path) ||
        /^\/payment-links\/[A-Za-z0-9_-]{40,50}$/.test(path))
    )
  }
  return (
    method === "POST" &&
    path === "/payment-links" &&
    scopes.includes("payments:write")
  )
}
