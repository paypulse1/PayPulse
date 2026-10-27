import assert from "node:assert/strict"
import { test } from "vitest"
import { getLegalPage } from "../LegalPages"

test("legal routes resolve canonical paths and legacy aliases", () => {
  assert.equal(getLegalPage("/privacy"), "privacy")
  assert.equal(getLegalPage("/privacy-policy/"), "privacy")
  assert.equal(getLegalPage("/terms-of-service"), "terms")
  assert.equal(getLegalPage("/contact-us/"), "contact")
  assert.equal(getLegalPage("/unknown"), null)
})
