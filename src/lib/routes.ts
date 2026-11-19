export const APP_ROUTES = {
  home: "https://paypulse.live",
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
    "https://paypulse.live/login",
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
  paymentEnvironment: "production" | "sandbox" = "production",
) {
  const normalizedHostname = hostname.toLowerCase()
  if (normalizedHostname === "sandbox.paypulse.live")
    return "https://sandbox.paypulse.live"
  if (
    normalizedHostname === "paypulse.live" ||
    normalizedHostname === "www.paypulse.live"
  )
    return "https://paypulse.live"
  if (!isNativePlatform) return origin
  return paymentEnvironment === "sandbox"
    ? "https://sandbox.paypulse.live"
    : "https://paypulse.live"
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
    !["paypulse.live", "www.paypulse.live"].includes(
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
    "paypulse.live",
    "www.paypulse.live",
    "sandbox.paypulse.live",
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
