import assert from "node:assert/strict"
import { test } from "vitest"
import { getLegalPage } from "../LegalPages"
import { APP_ROUTES } from "./routes"

test("super-admin route uses the bossd path", () => {
  assert.equal(APP_ROUTES.admin, "/bossd")
})

test("legal routes resolve canonical paths and legacy aliases", () => {
  assert.equal(getLegalPage("/privacy"), "privacy")
  assert.equal(getLegalPage("/privacy-policy/"), "privacy")
  assert.equal(getLegalPage("/terms-of-service"), "terms")
  assert.equal(getLegalPage("/contact-us/"), "contact")
  assert.equal(getLegalPage("/unknown"), null)
})
