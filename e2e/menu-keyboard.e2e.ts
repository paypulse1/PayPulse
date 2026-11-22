import { expect, test, type Locator, type Page } from "@playwright/test"

async function mockMerchantApi(page: Page) {
  await page.route("https://api.drp.test/v1/**", async (route) => {
    const url = new URL(route.request().url())
    const responses: Record<string, unknown> = {
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
    const body = responses[url.pathname]
    await route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: "application/json",
      body: JSON.stringify(body ?? { error: "Unexpected test request." }),
    })
  })
}

async function expectFocusRing(locator: Locator) {
  await expect(locator).toBeFocused()
  const style = await locator.evaluate((el) => {
    const computed = getComputedStyle(el)
    return { outlineStyle: computed.outlineStyle, outlineWidth: computed.outlineWidth }
  })
  expect(style.outlineStyle).toBe("solid")
  expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2)
}

test("menu items are keyboard operable with visible focus and selected states", async ({
  page,
}) => {
  await mockMerchantApi(page)
  await page.goto("/?signin=1")
  await page.getByLabel("Merchant email").fill("merchant@example.com")
  await page.getByRole("button", { name: "Verify device by email" }).click()
  await page.getByLabel("Six-digit email code").fill("123456")
  await page.getByRole("button", { name: "Verify device" }).click()
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()

  const nav = page.getByRole("navigation", { name: "App navigation" })
  const home = nav.getByRole("button", { name: "Home" })
  const wallet = nav.getByRole("button", { name: "Wallet" })
  const transfer = nav.getByRole("button", { name: "Transfer" })
  const profile = nav.getByRole("button", { name: "Profile" })

  await expect(home).toHaveAttribute("aria-current", "page")

  await page.keyboard.press("Shift")
  await home.focus()
  await expectFocusRing(home)

  await page.keyboard.press("ArrowRight")
  await expectFocusRing(wallet)
  await page.keyboard.press("Enter")
  await expect(wallet).toHaveAttribute("aria-current", "page")
  await expect(home).not.toHaveAttribute("aria-current", "page")
  await expectFocusRing(wallet)

  await page.keyboard.press("End")
  await expectFocusRing(profile)
  await page.keyboard.press("ArrowRight")
  await expectFocusRing(home)
  await page.keyboard.press("ArrowLeft")
  await expectFocusRing(profile)
  await page.keyboard.press("ArrowLeft")
  await expectFocusRing(transfer)
  await page.keyboard.press(" ")
  await expect(transfer).toHaveAttribute("aria-current", "page")

  await page.keyboard.press("Home")
  await expectFocusRing(home)
  await page.keyboard.press("Enter")
  await expect(home).toHaveAttribute("aria-current", "page")

  const quickAction = page.locator(".quick-action").first()
  await quickAction.focus()
  await expectFocusRing(quickAction)

  await page.keyboard.press("Tab")
  await expectFocusRing(page.locator(".quick-action").nth(1))
})
