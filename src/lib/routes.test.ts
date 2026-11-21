import assert from "node:assert/strict"
import { test } from "vitest"
import {
  APP_ROUTES,
  getPublicCheckoutOrigin,
  getLegalPage,
  resolveAppLinkRoute,
  resolveAppRoute,
  shouldGateMerchantMaintenance,
  shouldShowMarketingHome,
} from "./routes"

test("super-admin route uses the bossd path", () => {
  assert.equal(APP_ROUTES.admin, "/bossd")
})

test("customer history has an isolated route", () => {
  assert.equal(APP_ROUTES.customer, "/customer")
})

test("marketing Android app links use the public Google Play listing", () => {
  assert.equal(
    APP_ROUTES.androidAppListing,
    "https://play.google.com/store/apps/details?id=ph.drpays.merchant.public&pcampaignid=web_share",
  )
})

test("USDT payment links use the public checkout host for each environment", () => {
  assert.equal(
    getPublicCheckoutOrigin(
      "sandbox.paypulse.live",
      "https://sandbox.paypulse.live",
    ),
    "https://sandbox.paypulse.live",
  )
  assert.equal(
    getPublicCheckoutOrigin("paypulse.live", "https://paypulse.live"),
    "https://paypulse.live",
  )
  assert.equal(
    getPublicCheckoutOrigin("www.paypulse.live", "https://www.paypulse.live"),
    "https://paypulse.live",
  )
  assert.equal(
    getPublicCheckoutOrigin("localhost", "http://localhost:8443"),
    "http://localhost:8443",
  )
  assert.equal(
    getPublicCheckoutOrigin("localhost", "capacitor://localhost", true),
    "https://paypulse.live",
  )
  assert.equal(
    getPublicCheckoutOrigin(
      "localhost",
      "capacitor://localhost",
      true,
      "sandbox",
    ),
    "https://sandbox.paypulse.live",
  )
})

test("legal routes resolve canonical paths and legacy aliases", () => {
  assert.equal(getLegalPage("/privacy"), "privacy")
  assert.equal(getLegalPage("/privacy-policy/"), "privacy")
  assert.equal(getLegalPage("/terms-of-service"), "terms")
  assert.equal(getLegalPage("/contact-us/"), "contact")
  assert.equal(getLegalPage("/unknown"), null)
})

test("merchant root and the explicit marketing route show the marketing homepage", () => {
  assert.equal(shouldShowMarketingHome("/", "paypulse.live"), true)
  assert.equal(
    shouldShowMarketingHome("/", "paypulse.live", "?checkout=abc"),
    false,
  )
  assert.equal(
    shouldShowMarketingHome("/", "paypulse.live", "?signin=1"),
    false,
  )
  assert.equal(
    shouldShowMarketingHome("/", "paypulse.live", "?ref=A1B2C3D4E5F6G7H8"),
    false,
  )
  assert.equal(
    shouldShowMarketingHome("/", "sandbox.paypulse.live"),
    false,
  )
  assert.equal(shouldShowMarketingHome("/app", "paypulse.live"), false)
  assert.equal(shouldShowMarketingHome("/login", "paypulse.live"), false)
  assert.equal(shouldShowMarketingHome(APP_ROUTES.marketing, "paypulse.live"), true)
  assert.equal(
    shouldShowMarketingHome(`${APP_ROUTES.marketing}/`, "paypulse.live"),
    true,
  )
})

test("merchant maintenance does not replace checkout, customer, marketing, or admin pages", () => {
  assert.equal(shouldGateMerchantMaintenance("/", "sandbox.paypulse.live"), true)
  assert.equal(shouldGateMerchantMaintenance("/app/wallet", "paypulse.live"), true)
  assert.equal(
    shouldGateMerchantMaintenance("/", "paypulse.live", "?checkout=code"),
    false,
  )
  assert.equal(
    shouldGateMerchantMaintenance("/checkout/abc", "paypulse.live"),
    false,
  )
  assert.equal(
    shouldGateMerchantMaintenance("/customer", "paypulse.live"),
    false,
  )
  assert.equal(
    shouldGateMerchantMaintenance("/bossd", "paypulse.live"),
    false,
  )
  assert.equal(
    shouldGateMerchantMaintenance("/marketing", "paypulse.live"),
    false,
  )
  assert.equal(
    shouldGateMerchantMaintenance("/contact", "paypulse.live"),
    false,
  )
})

test("application routes resolve to the expected page", () => {
  const cases = [
    ["/maintenance/", "localhost", "", "maintenance"],
    ["/", "paypulse.live", "", "marketing"],
    ["/marketing/", "localhost", "", "marketing"],
    ["/login", "localhost", "", "merchant-entry"],
    ["/", "sandbox.paypulse.live", "", "merchant-entry"],
    ["/checkout/usdt/", "localhost", "", "usdt-payment"],
    [
      `/checkout/${"A".repeat(40)}`,
      "localhost",
      "",
      "checkout",
    ],
    ["/", "localhost", `?checkout=${"B".repeat(40)}`, "checkout"],
    ["/privacy-policy/", "localhost", "", "legal"],
    ["/bossd/users", "localhost", "", "admin"],
    ["/customer/", "localhost", "", "customer"],
    ["/app/wallet", "paypulse.live", "", "merchant-entry"],
    ["/unknown", "localhost", "", "marketing"],
  ] as const

  for (const [pathname, hostname, search, type] of cases) {
    assert.equal(
      resolveAppRoute({ pathname, hostname, search }).type,
      type,
      `${hostname}${pathname}${search}`,
    )
  }
})

test("verified app links resolve supported PayPulse URLs and reject other origins", () => {
  assert.equal(
    resolveAppLinkRoute(`https://paypulse.live/checkout/${"A".repeat(40)}`)
      ?.type,
    "checkout",
  )
  assert.equal(
    resolveAppLinkRoute("https://paypulse.live/login")?.type,
    "merchant-entry",
  )
  assert.equal(resolveAppLinkRoute("http://paypulse.live/login"), null)
  assert.equal(resolveAppLinkRoute("https://paypulse.live:8443/login"), null)
  assert.equal(resolveAppLinkRoute("https://sandbox.paypulse.live/login"), null)
  assert.equal(
    resolveAppLinkRoute("https://paypulse.live.evil.example/login"),
    null,
  )
  assert.equal(resolveAppLinkRoute("not a url"), null)
})

test("invalid checkout codes preserve the root dashboard route", () => {
  assert.equal(
    resolveAppRoute({
      pathname: "/",
      hostname: "localhost",
      search: "?checkout=invalid",
    }).type,
    "merchant-dashboard",
  )
})

test("native entry routes to merchant sign-in", () => {
  const route = resolveAppRoute(
    { pathname: "/unknown", hostname: "localhost", search: "" },
    true,
  )
  assert.equal(route.type, "merchant-entry")
  if (route.type === "merchant-entry") {
    assert.equal(route.target.type, "merchant-dashboard")
  }
})

test("merchant entry resolves the page to show after its availability check", () => {
  const productionRoute = resolveAppRoute({
    pathname: "/login",
    hostname: "paypulse.live",
    search: "",
  })
  const localRoute = resolveAppRoute({
    pathname: "/login",
    hostname: "localhost",
    search: "",
  })

  assert.equal(productionRoute.type, "merchant-entry")
  assert.equal(
    productionRoute.type === "merchant-entry"
      ? productionRoute.target.type
      : null,
    "merchant-dashboard",
  )
  assert.equal(localRoute.type, "merchant-entry")
  assert.equal(
    localRoute.type === "merchant-entry" ? localRoute.target.type : null,
    "marketing",
  )
})
