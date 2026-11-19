import assert from "node:assert/strict"
import { afterEach, test, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

test.each([
  ["paypulse.live", "https://api.live.example.test"],
  ["sandbox.paypulse.live", "https://api.sandbox.example.test"],
  ["www.paypulse.live", "https://api.live.example.test"],
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

test("uses the Render production API when no live API URL is configured", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "")
  vi.stubEnv("VITE_DRPAY_LIVE_BACKEND_URL", "")
  vi.stubGlobal("window", {
    location: {
      hostname: "paypulse.live",
      origin: "https://paypulse.live",
    },
  })

  const { getApiBaseUrl } = await import("./swiftpay.ts")
  assert.equal(
    getApiBaseUrl(),
    "https://drpay-live-api.onrender.com",
  )
})

test("does not use the frontend origin as an unconfigured API base URL", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "")
  vi.stubEnv("VITE_DRPAY_LIVE_BACKEND_URL", "")
  vi.stubEnv("VITE_DRPAY_SANDBOX_BACKEND_URL", "")
  vi.stubGlobal("window", {
    location: {
      hostname: "localhost",
      origin: "http://localhost:8443",
    },
  })

  const { getApiBaseUrl } = await import("./swiftpay.ts")
  assert.equal(getApiBaseUrl(), "")
})
