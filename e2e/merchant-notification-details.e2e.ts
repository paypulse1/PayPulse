import { expect, test } from "@playwright/test"
import { signInAsMerchant } from "./support/merchant-session"

test("inbox groups updates, opens verified payment details and keeps unread counts in sync", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await signInAsMerchant(page)
  const today = new Date().toISOString()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  let readAt: string | null = null
  const payment = {
    id: "6e4d510a-2f67-4453-9a17-76a75f68ca45",
    type: "PAYMENT",
    title: "Payment received",
    description: "Invoice from API",
    reference: "PAY-DETAIL-123",
    amount: 100,
    createdAt: today,
    readAt,
  }
  let pagesLoaded = 0
  await page.route(
    "https://api.drp.test/v1/notifications/inbox**",
    async (route) => {
      const url = new URL(route.request().url())
      let response: unknown
      if (url.pathname.endsWith("/read")) {
        readAt = new Date().toISOString()
        response = { readAt }
      } else if (url.pathname.endsWith("/read-all")) {
        readAt = new Date().toISOString()
        response = { updated: 1, unreadCount: 0 }
      } else {
        const older = url.searchParams.get("offset") !== "0"
        if (url.searchParams.get("limit") === "20") pagesLoaded += 1
        response = {
          notifications: older
            ? [
                {
                  ...payment,
                  id: "older",
                  reference: "OLDER-TRANSFER",
                  type: "DISBURSEMENT",
                  title: "Transfer completed",
                  createdAt: yesterday.toISOString(),
                  readAt: today,
                },
              ]
            : [{ ...payment, readAt }],
          unreadCount: readAt ? 0 : 1,
          hasMore: !older,
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      })
    },
  )
  await page.route(
    "https://api.drp.test/v1/wallet/activity?**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "payment-id",
            referenceNo: payment.reference,
            amount: 100,
            walletAmount: 97,
            status: "REVERSED",
            channel: "QR Ph checkout",
            transactionType: "PAYMENT_LINK",
            description: payment.description,
            createdAt: today,
            canRefund: false,
            refundStatus: null,
          },
        ]),
      })
    },
  )
  await page
    .getByRole("button", { name: /^Notifications(?:, \d+ unread)?$/ })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Notifications",
    exact: true,
  })
  await expect(
    dialog.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Unread", exact: true }).click()
  await dialog
    .getByRole("button", { name: /View details: Payment received/ })
    .click()
  await expect(
    dialog.getByRole("heading", { name: "Payment details" }),
  ).toBeFocused()
  await expect(dialog.getByText("Failed", { exact: true })).toBeVisible()
  await expect(dialog.getByText("REVERSED", { exact: true })).toBeVisible()
  await expect(dialog.getByText("₱97.00", { exact: true })).toBeVisible()
  await expect(dialog.getByText("Net amount", { exact: true })).toHaveCount(0)
  await expect(dialog.getByText("Fee", { exact: true })).toHaveCount(0)
  await expect(
    dialog.getByRole("button", { name: "Download receipt", exact: true }),
  ).toBeVisible()
  await dialog
    .getByRole("button", { name: "Copy receipt details", exact: true })
    .click()
  const copiedReceipt = await page.evaluate(() =>
    navigator.clipboard.readText(),
  )
  expect(copiedReceipt).toContain("Status: Failed (REVERSED)")
  expect(copiedReceipt).toContain("Wallet credit: ₱97.00")
  expect(copiedReceipt).not.toContain("Fee")
  const downloadPromise = page.waitForEvent("download")
  await dialog
    .getByRole("button", { name: "Download receipt", exact: true })
    .click()
  const receipt = await downloadPromise
  expect(receipt.suggestedFilename()).toContain("PAY-DETAIL-123")
  await dialog.evaluate((element) => {
    element.scrollTop = 0
  })
  await dialog.screenshot({ path: testInfo.outputPath("payment-details.png") })
  await dialog.getByRole("button", { name: "Back to notifications" }).click()
  await expect(
    dialog.getByText("You’re all caught up", { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "Unread", exact: true }),
  ).toBeFocused()
  await dialog.getByRole("button", { name: "All", exact: true }).click()
  await dialog.getByRole("button", { name: "Load older notifications" }).click()
  await expect(
    dialog.getByRole("heading", { name: "Yesterday", exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByText("Transfer completed", { exact: true }),
  ).toBeVisible()
  expect(pagesLoaded).toBe(2)
  await dialog.screenshot({ path: testInfo.outputPath("notifications.png") })
})

test("unmatched notifications never imply a current status or offer an unverified receipt", async ({
  page,
}) => {
  await signInAsMerchant(page)
  await page.route(
    "https://api.drp.test/v1/notifications/inbox**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          notifications: [
            {
              id: "6e4d510a-2f67-4453-9a17-76a75f68ca45",
              type: "DISBURSEMENT",
              title: "Transfer completed",
              description: "Older transfer",
              reference: "OLDER-REFERENCE",
              amount: 100,
              createdAt: "2025-01-01T12:00:00Z",
              readAt: "2025-01-01T12:01:00Z",
            },
          ],
          unreadCount: 0,
          hasMore: false,
        }),
      })
    },
  )
  await page
    .getByRole("button", { name: /^Notifications(?:, \d+ unread)?$/ })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Notifications",
    exact: true,
  })
  await dialog
    .getByRole("button", { name: /View details: Transfer completed/ })
    .click()
  await expect(
    dialog.getByText("Current status unavailable", { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByText(/not found in your recent activity/),
  ).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "Download receipt", exact: true }),
  ).toHaveCount(0)
  await expect(
    dialog.getByRole("button", { name: "Copy receipt details", exact: true }),
  ).toHaveCount(0)
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
    document.execCommand = () => false
  })
  await dialog
    .getByRole("button", { name: "Copy reference", exact: true })
    .click()
  await expect(
    dialog.getByText(
      "Copy is unavailable. Select and copy the reference below.",
    ),
  ).toBeVisible()
})

test("inbox retries a failed load and marks all updates read without losing them", async ({
  page,
}) => {
  await signInAsMerchant(page)
  let failed = false
  let unreadCount = 2
  await page.route(
    "https://api.drp.test/v1/notifications/inbox**",
    async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get("limit") === "20" && !failed) {
        failed = true
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Inbox temporarily unavailable." }),
        })
        return
      }
      if (url.pathname.endsWith("/read-all")) {
        unreadCount = 0
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ updated: 2, unreadCount }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          notifications: [1, 2].map((id) => ({
            id: `notification-${id}`,
            type: "PAYMENT",
            title: `Payment ${id} received`,
            description: "Invoice",
            reference: `PAY-${id}`,
            amount: id * 100,
            createdAt: new Date().toISOString(),
            readAt: null,
          })),
          unreadCount,
          hasMore: false,
        }),
      })
    },
  )
  await page
    .getByRole("button", { name: /^Notifications(?:, \d+ unread)?$/ })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Notifications",
    exact: true,
  })
  await expect(dialog.getByRole("alert")).toContainText(
    "Inbox temporarily unavailable.",
  )
  await dialog.getByRole("button", { name: "Refresh inbox" }).click()
  await expect(
    dialog.getByText("2 unread notifications", { exact: true }),
  ).toBeVisible()
  await dialog
    .getByRole("button", { name: "Mark all read", exact: true })
    .click()
  await expect(
    dialog.getByText("You’re all caught up.", { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: /View details: Payment/ }),
  ).toHaveCount(2)
  await expect(
    dialog.getByRole("button", { name: "Mark all read", exact: true }),
  ).toBeDisabled()
  await dialog.getByRole("button", { name: "Unread", exact: true }).click()
  await expect(
    dialog.getByText("Your unread updates will appear here.", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible()
})
