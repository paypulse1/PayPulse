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
    location: {
      hostname: "pay.live.denpay.cc",
      origin: "https://pay.live.denpay.cc",
    },
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
    assert.equal(
      error.message,
      "Please pay the required TAX or contact support.",
    )
    return true
  })
})

test("API errors include their server reference for support", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.example.test")
  vi.stubGlobal("window", {
    location: {
      hostname: "localhost",
      origin: "http://localhost",
    },
  })
  installSessionStorage(new MockStorage())
  saveSession({
    accessToken: "test-token",
    expiresAt: Date.now() + 60_000,
    email: "merchant@example.com",
    role: "merchant",
  })
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: "The request could not be completed.",
          requestId: "request-123",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
  )

  const { ApiError, getMerchantApiKeys } = await import("./swiftpay.ts")
  await assert.rejects(getMerchantApiKeys(), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.requestId, "request-123")
    assert.match(error.message, /Reference: request-123/)
    return true
  })
})

test("merchant registration verifies contact before submitting business details", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.example.test")
  vi.stubGlobal("window", {
    location: {
      hostname: "localhost",
      origin: "http://localhost",
    },
  })
  const requests: Array<{ url: string; options?: RequestInit }> = []
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, options?: RequestInit) => {
      requests.push({ url: input.toString(), options })
      const responses = [
        {
          challengeId: "registration-challenge",
          message: "A verification code has been sent.",
        },
        { email: "merchant@example.com", status: "verified" },
        { email: "merchant@example.com", status: "pending_review" },
      ]
      return new Response(JSON.stringify(responses[requests.length - 1]), {
        status: requests.length === 3 ? 202 : 200,
        headers: { "Content-Type": "application/json" },
      })
    },
  )

  const {
    requestMerchantRegistrationOtp,
    submitMerchantRegistration,
    verifyMerchantRegistrationOtp,
  } = await import("./swiftpay.ts")
  const registration = {
    email: "merchant@example.com",
    phoneNumber: "+639123456789",
  }
  const businessDetails = {
    businessName: "Example Store",
    contactPerson: "Alex Merchant",
    businessAddress: "1 Example Street, Manila",
    registrationNumber: "123456",
    businessType: "Corporation",
    country: "Philippines",
    ownerFullName: "Alex Merchant",
    ownerDateOfBirth: "1985-04-12",
    ownerNationality: "Filipino",
    ownerEmail: registration.email,
    ownerPhone: registration.phoneNumber,
    bankName: "Example Bank",
    accountName: "Example Store Inc.",
    accountNumber: "1234567890",
  }
  assert.equal(
    (await requestMerchantRegistrationOtp(registration)).challengeId,
    "registration-challenge",
  )
  assert.deepEqual(
    await verifyMerchantRegistrationOtp(
      registration.email,
      "registration-challenge",
      "123456",
    ),
    { email: registration.email, status: "verified" },
  )
  assert.deepEqual(
    await submitMerchantRegistration(
      registration.email,
      "registration-challenge",
      businessDetails,
      "1234",
    ),
    { email: registration.email, status: "pending_review" },
  )
  assert.deepEqual(
    requests.map(({ url, options }) => ({
      url,
      method: options?.method,
      body: JSON.parse(String(options?.body)),
    })),
    [
      {
        url: "https://api.example.test/v1/auth/registration/otp/request",
        method: "POST",
        body: registration,
      },
      {
        url: "https://api.example.test/v1/auth/registration/otp/verify",
        method: "POST",
        body: {
          email: registration.email,
          challengeId: "registration-challenge",
          code: "123456",
        },
      },
      {
        url: "https://api.example.test/v1/auth/registration/submit",
        method: "POST",
        body: {
          email: registration.email,
          challengeId: "registration-challenge",
          ...businessDetails,
          pin: "1234",
        },
      },
    ],
  )
})

test("merchant registration uploads identity documents through a signed private URL", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.example.test")
  vi.stubGlobal("window", {
    location: {
      hostname: "localhost",
      origin: "http://localhost",
    },
  })
  const requests: Array<{ url: string; options?: RequestInit }> = []
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = input.toString()
      requests.push({ url, options })
      if (url === "https://storage.example.test/signed-upload")
        return new Response(null, { status: 200 })
      const response = url.endsWith("/presign")
        ? {
            documentId: "document-id",
            uploadUrl: "https://storage.example.test/signed-upload",
            objectKey: "kyb/document-id",
            fileName: "owner-id.png",
            headers: { "Content-Type": "image/png" },
          }
        : { uploaded: true, documentType: "identity_front" }
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    },
  )

  const { uploadMerchantRegistrationDocument } = await import("./swiftpay.ts")
  const file = new File(["identity document"], "owner-id.png", {
    type: "image/png",
  })
  assert.deepEqual(
    await uploadMerchantRegistrationDocument(
      "registration-challenge",
      "identity_front",
      file,
    ),
    { uploaded: true, documentType: "identity_front" },
  )
  assert.deepEqual(
    requests.map(({ url, options }) => ({ url, method: options?.method })),
    [
      {
        url: "https://api.example.test/v1/auth/registration/documents/presign",
        method: "POST",
      },
      {
        url: "https://storage.example.test/signed-upload",
        method: "PUT",
      },
      {
        url: "https://api.example.test/v1/auth/registration/documents/complete",
        method: "POST",
      },
    ],
  )
  assert.equal(requests[1].options?.body, file)
  assert.deepEqual(JSON.parse(String(requests[2].options?.body)), {
    challengeId: "registration-challenge",
    documentId: "document-id",
    objectKey: "kyb/document-id",
    documentType: "identity_front",
    fileName: "owner-id.png",
    contentType: "image/png",
    sizeBytes: file.size,
  })
})
