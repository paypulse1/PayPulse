import assert from "node:assert/strict"
import { afterEach, test, vi } from "vitest"

class MockStorage {
  private store = new Map<string, string>()

  getItem(key: string) {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  removeItem(key: string) {
    this.store.delete(key)
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

test("notification inbox client fetches pages and marks alerts as read", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.example.test")
  Object.defineProperty(globalThis, "sessionStorage", {
    value: new MockStorage(),
    configurable: true,
    writable: true,
  })
  const notification = {
    id: "6e4d510a-2f67-4453-9a17-76a75f68ca45",
    type: "PAYMENT",
    title: "Payment received",
    description: "Invoice 123",
    reference: "DRP-123",
    amount: 125,
    createdAt: "2026-10-26T12:00:00.000Z",
    readAt: null,
  }
  const requests: {
    url: string
    method: string
    authorization: string | null
  }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || "GET"
      requests.push({
        url,
        method,
        authorization: new Headers(init?.headers).get("Authorization"),
      })
      const payload = url.endsWith("/read-all")
        ? { updated: 1, unreadCount: 0 }
        : url.endsWith("/read")
          ? { readAt: "2026-10-26T12:10:00.000Z" }
          : { notifications: [notification], unreadCount: 1, hasMore: false }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }),
  )

  const api = await import("./swiftpay.ts")
  api.saveSession({
    accessToken: "test-session-token",
    expiresAt: Date.now() + 60_000,
    email: "merchant@example.com",
    role: "merchant",
  })

  assert.deepEqual(await api.getMerchantNotificationInbox({ limit: 20 }), {
    notifications: [notification],
    unreadCount: 1,
    hasMore: false,
  })
  assert.deepEqual(await api.markMerchantNotificationRead(notification.id), {
    readAt: "2026-10-26T12:10:00.000Z",
  })
  assert.deepEqual(await api.markAllMerchantNotificationsRead(), {
    updated: 1,
    unreadCount: 0,
  })

  assert.match(
    requests[0].url,
    /\/v1\/notifications\/inbox\?limit=20&offset=0$/,
  )
  assert.equal(requests[0].method, "GET")
  assert.equal(
    requests[1].url,
    `https://api.example.test/v1/notifications/inbox/${notification.id}/read`,
  )
  assert.equal(requests[1].method, "POST")
  assert.equal(
    requests[2].url,
    "https://api.example.test/v1/notifications/inbox/read-all",
  )
  assert.ok(
    requests.every(
      (request) => request.authorization === "Bearer test-session-token",
    ),
  )
})
