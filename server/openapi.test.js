import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const spec = JSON.parse(
  await readFile(new URL("../public/openapi.json", import.meta.url), "utf8"),
)

test("publishes an OpenAPI 3.1 merchant API specification", () => {
  assert.equal(spec.openapi, "3.1.0")
  assert.ok(spec.servers.some((server) => server.description === "Production"))
  assert.ok(spec.servers.some((server) => server.description === "Sandbox"))
  assert.equal(spec.components.securitySchemes.MerchantBearerToken.scheme, "bearer")
})

test("documents the merchant API operations and their required scopes", () => {
  const operations = [
    ["get", "/v1/wallet/balance", "read"],
    ["get", "/v1/wallet/activity", "read"],
    ["get", "/v1/internal-wallet", "read"],
    ["post", "/v1/payment-links", "payments:write"],
    ["get", "/v1/payment-links/{code}", "read"],
    ["get", "/v1/payment-institutions", "read"],
    ["get", "/v1/disbursement-institutions", "read"],
    ["get", "/v1/crypto/usdt-wallet", "read"],
    ["get", "/v1/crypto/usdt-deposits", "read"],
  ]

  for (const [method, path, scope] of operations) {
    assert.deepEqual(spec.paths[path]?.[method]?.["x-required-scopes"], [scope])
  }
})

test("uses resolvable local schema references", () => {
  const references = []
  const collectReferences = (value) => {
    if (Array.isArray(value)) {
      value.forEach(collectReferences)
      return
    }
    if (!value || typeof value !== "object") return
    if (typeof value.$ref === "string" && value.$ref.startsWith("#/")) {
      references.push(value.$ref)
    }
    Object.values(value).forEach(collectReferences)
  }
  collectReferences(spec)

  for (const reference of references) {
    const target = reference
      .slice(2)
      .split("/")
      .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
      .reduce((current, part) => current?.[part], spec)
    assert.notEqual(target, undefined, `Unresolved OpenAPI reference: ${reference}`)
  }
})
