export const APP_ROUTES = {
  home: "https://denpay.cc",
  app: "/app",
  admin: "/bossd",
  checkout: "/checkout",
  privacy: "/privacy",
  terms: "/terms",
  contact: "/contact",
  merchantSignIn:
    import.meta.env.VITE_DRPAY_MERCHANT_SIGNIN_URL ||
    "https://merchant.denpay.cc",
  androidDownload: "/drpay.apk",
  capabilities: "#capabilities",
  workflow: "#workflow",
  security: "#security",
} as const

export const LEGAL_ROUTE_ALIASES: Record<"privacy" | "terms" | "contact", readonly string[]> =
  {
    privacy: [APP_ROUTES.privacy, "/privacy-policy"],
    terms: [APP_ROUTES.terms, "/terms-of-service"],
    contact: [APP_ROUTES.contact, "/contact-us"],
  } as const

const MERCHANT_APP_HOSTS = new Set([
  "merchant.denpay.cc",
  "merchant.sandbox.denpay.cc",
  "live.merchant.swiftpay.site",
])

export function shouldShowMarketingHome(
  pathname: string,
  search: string,
  hostname: string,
) {
  if (pathname !== "/" && pathname !== "") return false

  const query = new URLSearchParams(search)
  if (query.has("checkout") || query.get("signin") === "1") return false

  return !MERCHANT_APP_HOSTS.has(hostname.toLowerCase())
}
