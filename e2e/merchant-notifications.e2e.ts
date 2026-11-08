import { expect, test } from "@playwright/test"

const notification = {
  id: "6e4d510a-2f67-4453-9a17-76a75f68ca45",
  type: "PAYMENT",
  title: "Payment received",
  description: "Test invoice",
  reference: "DRP-E2E-123",
  amount: 125,
  createdAt: "2026-10-26T12:00:00.000Z",
  readAt: null,
}

test("merchant can verify a device and read inbox notifications", async ({
  page,
}) => {
  let walletBalanceRequests = 0
  let unreadInboxCount = 1
  await page.route("https://api.drp.test/v1/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    let response: Record<string, unknown> = {}

    if (url.pathname === "/v1/auth/device/otp/request") {
      response = { challengeId: "test-challenge", message: "Code sent." }
    } else if (url.pathname === "/v1/auth/device/otp/verify") {
      response = {
        accessToken: "test-merchant-session",
        expiresInSeconds: 3600,
        email: "merchant@example.com",
        role: "merchant",
      }
    } else if (url.pathname === "/v1/wallet/balance") {
      walletBalanceRequests += 1
      response = {
        balance: 0,
        availableBalance: 0,
        reservedBalance: 0,
        cumulativeKrwCollections: 0,
        walletMode: "internal",
        paymentEnvironment: "sandbox",
      }
      if (walletBalanceRequests === 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } else if (url.pathname === "/v1/wallet/activity") {
      response = []
    } else if (url.pathname === "/v1/internal-wallet") {
      response = {
        currency: "PHP",
        balance: 0,
        availableBalance: 0,
        transferFeeFixed: 15,
        label: "Floating balance",
      }
    } else if (url.pathname === "/v1/security/status") {
      response = { pinConfigured: true }
    } else if (url.pathname === "/v1/notifications/inbox") {
      response = {
        notifications:
          url.searchParams.get("limit") === "1" ? [] : [notification],
        unreadCount: unreadInboxCount,
        hasMore: false,
      }
    } else if (url.pathname === "/v1/notifications/inbox/read-all") {
      unreadInboxCount = 0
      response = { updated: 1, unreadCount: unreadInboxCount }
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected test request." }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    })
  })

  await page.goto("/?signin=1")
  await expect(
    page.getByRole("heading", { name: "Sign in to DRPAY" }),
  ).toBeVisible()
  await expect(page.getByRole("img", { name: "Black Sheep" })).toBeVisible()
  await expect(page.getByRole("img", { name: "DRL Technology" })).toBeVisible()
  await expect(page.getByRole("img", { name: "Netbank" })).toBeVisible()

  await page.getByLabel("Merchant email").fill("merchant@example.com")
  await page.getByRole("button", { name: "Verify device by email" }).click()
  await page.getByLabel("Six-digit email code").fill("123456")
  await page.getByRole("button", { name: "Verify device" }).click()

  const loadingScreen = page.getByRole("status", {
    name: "Loading merchant dashboard",
  })
  await expect(loadingScreen).toBeVisible()
  await expect(loadingScreen.locator(".loading-emblem-spinner")).toBeVisible()
  await expect(loadingScreen.locator(".loading-emblem-spinner")).toHaveCSS(
    "animation-name",
    "spin",
  )

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  await expect(
    page.locator(".balance-card").getByRole("img", { name: "Netbank" }),
  ).toBeVisible()
  await expect(page.locator(".balance-card")).not.toContainText(
    "Floating balance",
  )
  await expect.poll(() => walletBalanceRequests).toBe(1)
  unreadInboxCount = 2
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(
    page.getByRole("button", { name: "Notifications, 2 unread" }),
  ).toBeVisible()
  await page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("button", { name: "Wallet" })
    .click()
  await page
    .locator(".balance-card")
    .getByRole("button", { name: "Transfer PHP" })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Send money" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
  await page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("button", { name: "Home" })
    .click()

  await page.evaluate(() => {
    const target = document.querySelector(".app-scroll")
    if (!target) throw new Error("Dashboard scroll area was not found.")
    target.scrollTop = 0
    const initial = new Touch({
      identifier: 1,
      target,
      clientX: 100,
      clientY: 100,
    })
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [initial],
        targetTouches: [initial],
        changedTouches: [initial],
      }),
    )
    const pulled = new Touch({
      identifier: 1,
      target,
      clientX: 100,
      clientY: 230,
    })
    target.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [pulled],
        targetTouches: [pulled],
        changedTouches: [pulled],
      }),
    )
  })
  await expect(page.getByText("Release to refresh")).toBeVisible()
  await page.evaluate(() => {
    const target = document.querySelector(".app-scroll")
    if (!target) throw new Error("Dashboard scroll area was not found.")
    const touch = new Touch({
      identifier: 1,
      target,
      clientX: 100,
      clientY: 230,
    })
    target.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [touch],
      }),
    )
  })
  await expect.poll(() => walletBalanceRequests).toBe(2)

  const notificationsButton = page.getByRole("button", {
    name: "Notifications, 2 unread",
  })
  await expect(notificationsButton).toBeVisible()
  await notificationsButton.click()

  const notificationDialog = page.getByRole("dialog", {
    name: "Notifications",
  })
  await expect(notificationDialog.getByText("Payment received")).toBeVisible()
  await expect(page.getByText("DRP-E2E-123")).toBeVisible()
  await page.getByRole("button", { name: "Mark all read" }).click()
  await expect(
    page.getByRole("button", { name: "Notifications" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Done" }).click()

  await page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("button", { name: "Profile" })
    .click()
  await page.getByRole("button", { name: /Help center/ }).click()
  await expect(page.getByText("Guides and common questions")).toBeVisible()
  await page
    .getByText("Transfer is pending or the recipient has not received it")
    .click()
  await expect(
    page.getByText("Don’t submit the transfer again while it is pending."),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Email DRPAY support/ }),
  ).toHaveAttribute("href", /mailto:support@denpay\.cc\?subject=/)
})
