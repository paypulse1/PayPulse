import assert from "node:assert/strict"
import { afterEach, test, vi } from "vitest"

import { getSession, saveSession } from "./swiftpay.ts"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

class MockStorage {
  private store = new Map<string, string>()

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }
}

function installSessionStorage(storage: MockStorage) {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: storage,
    configurable: true,
    writable: true,
    enumerable: true,
  })
}

test("getSession rejects malformed session objects", () => {
  const storage = new MockStorage()
  installSessionStorage(storage)
  storage.setItem("drpay_session", JSON.stringify({ accessToken: "abc" }))

  assert.equal(getSession(), null)
  assert.equal(storage.getItem("drpay_session"), null)
})

test("getSession accepts a valid verified session", () => {
  const storage = new MockStorage()
  installSessionStorage(storage)
  const validSession = {
    accessToken: "abc123",
    expiresAt: Date.now() + 60_000,
    email: "merchant@example.com",
    role: "merchant",
  } as const

  saveSession(validSession)

  assert.deepEqual(getSession(), validSession)
})

test("activation gate errors use the tax and support message", async () => {
  vi.stubEnv("VITE_DRPAY_LIVE_BACKEND_URL", "https://api.example.test")
  vi.stubGlobal("window", {
    location: { hostname: "pay.live.denpay.cc", origin: "https://pay.live.denpay.cc" },
  })
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error:
            "Pay the one-time PHP activation fee and maintain 100 USDT above the assigned address's starting balance to enable this merchant service.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
  )

  const { ApiError, getPublicCheckout } = await import("./swiftpay.ts")
  await assert.rejects(getPublicCheckout("checkout-code"), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.message, "Please pay the required TAX or contact support.")
    return true
  })
})
