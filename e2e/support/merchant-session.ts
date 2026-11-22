import { expect, type Page } from "@playwright/test"

const merchantApiResponses: Record<string, unknown> = {
  "/v1/auth/device/otp/request": { challengeId: "c", message: "Code sent." },
  "/v1/auth/device/otp/verify": {
    accessToken: "test-merchant-session",
    expiresInSeconds: 3600,
    email: "merchant@example.com",
    role: "merchant",
  },
  "/v1/wallet/balance": {
    balance: 0,
    availableBalance: 0,
    reservedBalance: 0,
    cumulativeKrwCollections: 0,
    walletMode: "internal",
    paymentEnvironment: "sandbox",
  },
  "/v1/wallet/activity": [],
  "/v1/wallet/activity/trend": [],
  "/v1/internal-wallet": {
    currency: "PHP",
    balance: 0,
    availableBalance: 0,
    transferFeeFixed: 15,
    label: "Floating balance",
  },
  "/v1/security/status": { pinConfigured: true },
  "/v1/notifications/inbox": { notifications: [], unreadCount: 0, hasMore: false },
  "/v1/maintenance-status": { enabled: false },
  "/v1/kyb": { profile: null, documents: [] },
}

/** Mocks the merchant API and signs in through the device-verification flow. */
export async function signInAsMerchant(page: Page) {
  await page.route("https://api.drp.test/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url())
    const body = merchantApiResponses[pathname]
    await route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: "application/json",
      body: JSON.stringify(body ?? { error: "Unexpected test request." }),
    })
  })

  await page.goto("/?signin=1")
  await page.getByLabel("Merchant email").fill("merchant@example.com")
  await page.getByRole("button", { name: "Verify device by email" }).click()
  await page.getByLabel("Six-digit email code").fill("123456")
  await page.getByRole("button", { name: "Verify device" }).click()
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
}
