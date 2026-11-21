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
    "https://api.paypulse.live",
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

test("persists an explicit environment choice and routes to its API", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.default.example.test")
  vi.stubEnv("VITE_DRPAY_LIVE_BACKEND_URL", "https://api.live.example.test")
  vi.stubEnv(
    "VITE_DRPAY_SANDBOX_BACKEND_URL",
    "https://api.sandbox.example.test",
  )
  vi.stubGlobal("window", {
    location: {
      hostname: "paypulse.live",
      origin: "https://paypulse.live",
    },
  })
  const localStorage = new Map<string, string>()
  const sessionStorage = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localStorage.get(key) ?? null,
    setItem: (key: string, value: string) => localStorage.set(key, value),
    removeItem: (key: string) => localStorage.delete(key),
  })
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => sessionStorage.get(key) ?? null,
    setItem: (key: string, value: string) => sessionStorage.set(key, value),
    removeItem: (key: string) => sessionStorage.delete(key),
  })

  const { getApiBaseUrl, getPaymentEnvironment, setPaymentEnvironment } =
    await import("./swiftpay.ts")
  setPaymentEnvironment("sandbox")

  assert.equal(getPaymentEnvironment(), "sandbox")
  assert.equal(getApiBaseUrl(), "https://api.sandbox.example.test")
  localStorage.set(
    "drpay_payment_environment_preference",
    "production",
  )
  assert.equal(getApiBaseUrl(), "https://api.sandbox.example.test")
  sessionStorage.delete("drpay_payment_environment")
  assert.equal(getApiBaseUrl(), "https://api.live.example.test")
})

test("keeps separate sessions when switching between environments", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.live.example.test")
  vi.stubEnv("VITE_DRPAY_LIVE_BACKEND_URL", "https://api.live.example.test")
  vi.stubEnv(
    "VITE_DRPAY_SANDBOX_BACKEND_URL",
    "https://api.sandbox.example.test",
  )
  vi.stubGlobal("window", {
    location: {
      hostname: "paypulse.live",
      origin: "https://paypulse.live",
    },
  })
  const localStorage = new Map<string, string>()
  const sessionStorage = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localStorage.get(key) ?? null,
    setItem: (key: string, value: string) => localStorage.set(key, value),
    removeItem: (key: string) => localStorage.delete(key),
  })
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => sessionStorage.get(key) ?? null,
    setItem: (key: string, value: string) => sessionStorage.set(key, value),
    removeItem: (key: string) => sessionStorage.delete(key),
  })

  const { clearSession, getSession, saveSession, setPaymentEnvironment } =
    await import("./swiftpay.ts")
  const productionSession = {
    accessToken: "production-token",
    expiresAt: Date.now() + 60_000,
    email: "merchant@example.com",
    role: "merchant" as const,
  }
  const sandboxSession = {
    ...productionSession,
    accessToken: "sandbox-token",
  }

  saveSession(productionSession)
  setPaymentEnvironment("sandbox")
  assert.equal(getSession(), null)
  saveSession(sandboxSession)

  setPaymentEnvironment("production")
  assert.deepEqual(getSession(), productionSession)
  setPaymentEnvironment("sandbox")
  assert.deepEqual(getSession(), sandboxSession)
  clearSession()
  setPaymentEnvironment("production")
  assert.deepEqual(getSession(), productionSession)
})

test("refuses to select sandbox when its API is not configured", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.live.example.test")
  vi.stubEnv("VITE_DRPAY_LIVE_BACKEND_URL", "https://api.live.example.test")
  vi.stubEnv("VITE_DRPAY_SANDBOX_BACKEND_URL", "")
  vi.stubGlobal("window", {
    location: {
      hostname: "paypulse.live",
      origin: "https://paypulse.live",
    },
  })

  const { getApiBaseUrl, setPaymentEnvironment } = await import("./swiftpay.ts")
  assert.throws(
    () => setPaymentEnvironment("sandbox"),
    /Sandbox is not configured/,
  )
  assert.equal(getApiBaseUrl(), "https://api.live.example.test")
})
