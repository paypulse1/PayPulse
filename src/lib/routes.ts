export const APP_ROUTES = {
  home: "https://denpay.cc",
  marketing: "/marketing",
  merchantLogin: "/login",
  app: "/app",
  admin: "/bossd",
  checkout: "/checkout",
  privacy: "/privacy",
  terms: "/terms",
  contact: "/contact",
  merchantSignIn:
    import.meta.env.VITE_DRPAY_MERCHANT_SIGNIN_URL ||
    "https://merchant.denpay.cc/login",
  androidDownload: "/drpay.apk",
  capabilities: "#capabilities",
  workflow: "#workflow",
  security: "#security",
} as const

export function getPublicCheckoutOrigin(
  hostname: string,
  origin: string,
  isNativePlatform = false,
) {
  const normalizedHostname = hostname.toLowerCase()
  if (
    normalizedHostname === "merchant.sandbox.denpay.cc" ||
    normalizedHostname === "pay.sandbox.denpay.cc"
  ) {
    return "https://pay.sandbox.denpay.cc"
  }
  if (
    normalizedHostname === "merchant.denpay.cc" ||
    normalizedHostname === "pay.live.denpay.cc" ||
    normalizedHostname === "live.merchant.swiftpay.site"
  ) {
    return "https://pay.live.denpay.cc"
  }
  return isNativePlatform ? "https://pay.live.denpay.cc" : origin
}

export const LEGAL_ROUTE_ALIASES: Record<"privacy" | "terms" | "contact", readonly string[]> =
  {
    privacy: [APP_ROUTES.privacy, "/privacy-policy"],
    terms: [APP_ROUTES.terms, "/terms-of-service"],
    contact: [APP_ROUTES.contact, "/contact-us"],
  } as const

export function shouldShowMarketingHome(
  pathname: string,
  hostname: string,
  search = "",
) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/"
  if (normalizedPath === APP_ROUTES.marketing) return true
  if (
    normalizedPath !== "/" ||
    hostname.toLowerCase() !== "merchant.denpay.cc"
  ) {
    return false
  }
  const query = new URLSearchParams(search)
  return (
    !query.has("checkout") &&
    query.get("signin") !== "1" &&
    !query.has("ref")
  )
}
