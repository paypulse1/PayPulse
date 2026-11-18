export const APP_ROUTES = {
  home: "https://denpay.cc",
  marketing: "/marketing",
  merchantLogin: "/login",
  app: "/app",
  customer: "/customer",
  admin: "/bossd",
  checkout: "/checkout",
  privacy: "/privacy",
  terms: "/terms",
  contact: "/contact",
  merchantSignIn:
    import.meta.env.VITE_DRPAY_MERCHANT_SIGNIN_URL ||
    "https://pulsepay.live/login",
  androidAppListing:
    "https://play.google.com/store/apps/details?id=ph.drpays.merchant.public&pcampaignid=web_share",
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
    normalizedHostname === "live.merchant.swiftpay.site" ||
    normalizedHostname === "pulsepay.live" ||
    normalizedHostname === "www.pulsepay.live"
  ) {
    return normalizedHostname === "pulsepay.live" || normalizedHostname === "www.pulsepay.live"
      ? "https://pulsepay.live"
      : "https://pay.live.denpay.cc"
  }
  return isNativePlatform ? "https://pulsepay.live" : origin
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
    !["pulsepay.live", "www.pulsepay.live", "merchant.denpay.cc"].includes(
      hostname.toLowerCase(),
    )
  ) {
    return false
  }
  const query = new URLSearchParams(search)
  return (
    !query.has("checkout") && query.get("signin") !== "1" && !query.has("ref")
  )
}

export function shouldGateMerchantMaintenance(
  pathname: string,
  hostname: string,
  search = "",
  isNativePlatform = false,
) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/"
  const normalizedHostname = hostname.toLowerCase()
  const query = new URLSearchParams(search)
  const separateExperience =
    normalizedPath === "/maintenance" ||
    normalizedPath === APP_ROUTES.customer ||
    normalizedPath === APP_ROUTES.admin ||
    normalizedPath.startsWith(`${APP_ROUTES.admin}/`) ||
    normalizedPath === APP_ROUTES.checkout ||
    normalizedPath.startsWith(`${APP_ROUTES.checkout}/`) ||
    [
      "/privacy",
      "/privacy-policy",
      "/terms",
      "/terms-of-service",
      "/contact",
      "/contact-us",
    ].includes(normalizedPath) ||
    query.has("checkout") ||
    shouldShowMarketingHome(pathname, hostname, search)

  if (separateExperience) return false

  const merchantHost = [
    "pulsepay.live",
    "www.pulsepay.live",
    "merchant.denpay.cc",
    "merchant.sandbox.denpay.cc",
    "live.merchant.swiftpay.site",
  ].includes(normalizedHostname)

  return (
    isNativePlatform ||
    merchantHost ||
    normalizedPath === "/" ||
    normalizedPath === APP_ROUTES.merchantLogin ||
    normalizedPath === APP_ROUTES.app ||
    normalizedPath.startsWith(`${APP_ROUTES.app}/`) ||
    query.get("signin") === "1"
  )
}
