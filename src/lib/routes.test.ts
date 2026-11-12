import assert from "node:assert/strict"
import { test } from "vitest"
import { getLegalPage } from "../LegalPages"
import {
  APP_ROUTES,
  getPublicCheckoutOrigin,
  shouldShowMarketingHome,
} from "./routes"

test("super-admin route uses the bossd path", () => {
  assert.equal(APP_ROUTES.admin, "/bossd")
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
      "merchant.sandbox.denpay.cc",
      "https://merchant.sandbox.denpay.cc",
    ),
    "https://pay.sandbox.denpay.cc",
  )
  assert.equal(
    getPublicCheckoutOrigin(
      "merchant.denpay.cc",
      "https://merchant.denpay.cc",
    ),
    "https://pay.live.denpay.cc",
  )
  assert.equal(
    getPublicCheckoutOrigin("localhost", "http://localhost:8443"),
    "http://localhost:8443",
  )
  assert.equal(
    getPublicCheckoutOrigin("localhost", "capacitor://localhost", true),
    "https://pay.live.denpay.cc",
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
  assert.equal(shouldShowMarketingHome("/", "merchant.denpay.cc"), true)
  assert.equal(
    shouldShowMarketingHome("/", "merchant.denpay.cc", "?checkout=abc"),
    false,
  )
  assert.equal(
    shouldShowMarketingHome("/", "merchant.denpay.cc", "?signin=1"),
    false,
  )
  assert.equal(
    shouldShowMarketingHome("/", "merchant.denpay.cc", "?ref=A1B2C3D4E5F6G7H8"),
    false,
  )
  assert.equal(shouldShowMarketingHome("/", "merchant.sandbox.denpay.cc"), false)
  assert.equal(shouldShowMarketingHome("/app", "merchant.denpay.cc"), false)
  assert.equal(shouldShowMarketingHome("/login", "merchant.denpay.cc"), false)
  assert.equal(shouldShowMarketingHome(APP_ROUTES.marketing, "denpay.cc"), true)
  assert.equal(
    shouldShowMarketingHome(`${APP_ROUTES.marketing}/`, "denpay.cc"),
    true,
  )
})
