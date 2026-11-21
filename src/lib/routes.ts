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
  androidLiveApk: "/drpay-live.apk",
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
  if (PRODUCTION_WEB_HOSTS.has(normalizedHostname))
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

const PRODUCTION_WEB_HOSTS = new Set(["paypulse.live", "www.paypulse.live"])
const MERCHANT_HOSTS = new Set([
  ...PRODUCTION_WEB_HOSTS,
  "sandbox.paypulse.live",
])

export type LegalPageKind = keyof typeof LEGAL_ROUTE_ALIASES

export type AppContentRoute =
  | { type: "marketing" }
  | { type: "usdt-payment" }
  | { type: "checkout"; code: string }
  | { type: "legal"; page: LegalPageKind }
  | { type: "admin" }
  | { type: "customer" }
  | { type: "merchant-dashboard" }

export type AppRoute =
  | { type: "maintenance" }
  | AppContentRoute
  | { type: "merchant-entry"; target: AppContentRoute }

export type AppViewRoute = Exclude<AppContentRoute, { type: "marketing" }>

export interface RouteLocation {
  pathname: string
  hostname: string
  search: string
}

export function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/"
}

export function getLegalPage(pathname: string): LegalPageKind | null {
  const route = normalizePathname(pathname)
  for (const page of ["privacy", "terms", "contact"] as const) {
    if (LEGAL_ROUTE_ALIASES[page].includes(route)) return page
  }
  return null
}

export function shouldShowMarketingHome(
  pathname: string,
  hostname: string,
  search = "",
) {
  const normalizedPath = normalizePathname(pathname)
  if (normalizedPath === APP_ROUTES.marketing) return true
  if (
    normalizedPath !== "/" ||
    !PRODUCTION_WEB_HOSTS.has(hostname.toLowerCase())
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
  const normalizedPath = normalizePathname(pathname)
  const normalizedHostname = hostname.toLowerCase()
  const query = new URLSearchParams(search)
  const separateExperience =
    normalizedPath === "/maintenance" ||
    normalizedPath === APP_ROUTES.customer ||
    normalizedPath === APP_ROUTES.admin ||
    normalizedPath.startsWith(`${APP_ROUTES.admin}/`) ||
    normalizedPath === APP_ROUTES.checkout ||
    normalizedPath.startsWith(`${APP_ROUTES.checkout}/`) ||
    getLegalPage(normalizedPath) !== null ||
    query.has("checkout") ||
    shouldShowMarketingHome(pathname, hostname, search)

  if (separateExperience) return false

  return (
    isNativePlatform ||
    MERCHANT_HOSTS.has(normalizedHostname) ||
    normalizedPath === "/" ||
    normalizedPath === APP_ROUTES.merchantLogin ||
    normalizedPath === APP_ROUTES.app ||
    normalizedPath.startsWith(`${APP_ROUTES.app}/`) ||
    query.get("signin") === "1"
  )
}

export function resolveAppRoute(
  location: RouteLocation,
  isNativePlatform = false,
): AppRoute {
  const pathname = normalizePathname(location.pathname)

  if (pathname === "/maintenance") return { type: "maintenance" }
  if (
    shouldShowMarketingHome(
      location.pathname,
      location.hostname,
      location.search,
    )
  ) {
    return { type: "marketing" }
  }

  if (
    shouldGateMerchantMaintenance(
      location.pathname,
      location.hostname,
      location.search,
      isNativePlatform,
    )
  ) {
    return {
      type: "merchant-entry",
      target: resolveAppContentRoute(location, isNativePlatform),
    }
  }

  return resolveAppContentRoute(location, isNativePlatform)
}

export function resolveAppLinkRoute(url: string): AppRoute | null {
  let link: URL
  try {
    link = new URL(url)
  } catch {
    return null
  }

  if (
    link.protocol !== "https:" ||
    link.hostname.toLowerCase() !== "paypulse.live" ||
    link.port !== ""
  ) {
    return null
  }

  return resolveAppRoute(link, true)
}

export function resolveAppContentRoute(
  location: RouteLocation,
  isNativePlatform = false,
): AppContentRoute {
  const pathname = normalizePathname(location.pathname)
  const hostname = location.hostname.toLowerCase()
  const query = new URLSearchParams(location.search)

  if (pathname === `${APP_ROUTES.checkout}/usdt`) {
    return { type: "usdt-payment" }
  }

  const pathCheckoutCode = new RegExp(
    `^${APP_ROUTES.checkout}/([A-Za-z0-9_-]{40,50})$`,
  ).exec(pathname)?.[1]
  const queryCheckoutCode = query.get("checkout")
  const checkoutCode =
    pathCheckoutCode ||
    (queryCheckoutCode && /^[A-Za-z0-9_-]{40,50}$/.test(queryCheckoutCode)
      ? queryCheckoutCode
      : "")
  if (checkoutCode) return { type: "checkout", code: checkoutCode }

  const legalPage = getLegalPage(pathname)
  if (legalPage) return { type: "legal", page: legalPage }

  if (
    pathname === APP_ROUTES.admin ||
    pathname.startsWith(`${APP_ROUTES.admin}/`)
  ) {
    return { type: "admin" }
  }
  if (pathname === APP_ROUTES.customer) return { type: "customer" }

  const isMerchantDashboard =
    MERCHANT_HOSTS.has(hostname) ||
    isNativePlatform ||
    query.get("signin") === "1" ||
    pathname === "/" ||
    pathname === APP_ROUTES.app ||
    pathname.startsWith(`${APP_ROUTES.app}/`)

  return isMerchantDashboard
    ? { type: "merchant-dashboard" }
    : { type: "marketing" }
}
