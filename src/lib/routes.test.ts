import assert from "node:assert/strict"
import { test } from "vitest"
import { getLegalPage } from "../LegalPages"
import { APP_ROUTES, shouldShowMarketingHome } from "./routes"

test("super-admin route uses the bossd path", () => {
  assert.equal(APP_ROUTES.admin, "/bossd")
})

test("marketing Android download serves the public APK asset", () => {
  assert.equal(APP_ROUTES.androidDownload, "/drpay.apk")
})

test("legal routes resolve canonical paths and legacy aliases", () => {
  assert.equal(getLegalPage("/privacy"), "privacy")
  assert.equal(getLegalPage("/privacy-policy/"), "privacy")
  assert.equal(getLegalPage("/terms-of-service"), "terms")
  assert.equal(getLegalPage("/contact-us/"), "contact")
  assert.equal(getLegalPage("/unknown"), null)
})

test("marketing homepage is limited to the public root route", () => {
  assert.equal(shouldShowMarketingHome("/", "", "denpay.cc"), true)
  assert.equal(shouldShowMarketingHome("/", "?checkout=abc", "pay.live.denpay.cc"), false)
  assert.equal(shouldShowMarketingHome("/", "?signin=1", "denpay.cc"), false)
  assert.equal(shouldShowMarketingHome("/", "", "merchant.denpay.cc"), false)
  assert.equal(shouldShowMarketingHome("/", "", "merchant.sandbox.denpay.cc"), false)
  assert.equal(shouldShowMarketingHome("/app", "", "denpay.cc"), false)
})
