import assert from "node:assert/strict"
import { afterEach, test, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

test.each([
  ["merchant.denpay.cc", "https://api.live.example.test"],
  ["merchant.sandbox.denpay.cc", "https://api.sandbox.example.test"],
  ["pay.live.denpay.cc", "https://api.live.example.test"],
  ["pay.sandbox.denpay.cc", "https://api.sandbox.example.test"],
  ["drpay-web.onrender.com", "https://api.default.example.test"],
  ["localhost", "https://api.default.example.test"],
])("selects the matching API for %s", async (hostname, expectedApi) => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.default.example.test")
  vi.stubEnv("VITE_DRPAY_LIVE_BACKEND_URL", "https://api.live.example.test")
  vi.stubEnv(
    "VITE_DRPAY_SANDBOX_BACKEND_URL",
    "https://api.sandbox.example.test",
  )
  vi.stubGlobal("window", {
    location: { hostname, origin: "https://fallback.example.test" },
  })

  const { getApiBaseUrl } = await import("./swiftpay.ts")
  assert.equal(getApiBaseUrl(), expectedApi)
})

test("uses the Railway production API when no live API URL is configured", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "")
  vi.stubEnv("VITE_DRPAY_LIVE_BACKEND_URL", "")
  vi.stubGlobal("window", {
    location: {
      hostname: "merchant.denpay.cc",
      origin: "https://merchant.denpay.cc",
    },
  })

  const { getApiBaseUrl } = await import("./swiftpay.ts")
  assert.equal(
    getApiBaseUrl(),
    "https://drpay-merchant-production.up.railway.app",
  )
})
