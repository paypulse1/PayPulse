import { expect, test, type Locator, type Page } from "@playwright/test"
import { signInAsMerchant } from "./support/merchant-session"

async function expectContained(page: Page, surface: Locator) {
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  )
  expect(
    await surface.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
    "merchant content must not require horizontal scrolling",
  ).toBe(true)
}

async function finishEntranceAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

for (const width of [320, 440, 1280]) {
  test(`PayPulse merchant surfaces remain usable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await signInAsMerchant(page)
    const app = page.locator(".mobile-app")
    const nav = page.getByRole("navigation", { name: "App navigation" })
    await expectContained(page, app)
    await expect(app).toHaveCSS("background-color", "rgb(243, 247, 252)")
    if (width === 440) {
      await page.evaluate(() => document.fonts.ready)
      await finishEntranceAnimations(page)
      await page.screenshot({ path: testInfo.outputPath("home.png") })
    }

    for (const tab of ["Home", "Wallet", "Transfer", "Profile"]) {
      const button = nav.getByRole("button", { name: tab, exact: true })
      await button.click()
      await expect(button).toHaveAttribute("aria-current", "page")
      await expectContained(page, app)
      await expectContained(page, page.locator(".app-scroll"))
    }

    await nav.getByRole("button", { name: "Collect", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByRole("heading", { name: "Collect payment" }),
    ).toBeVisible()
    await expectContained(page, dialog)
    await expect(dialog.getByLabel("Reference or note")).toBeVisible()
    await expect(dialog.getByLabel("Amount in PHP")).toBeVisible()
    await expect(dialog).toHaveCSS("border-top-left-radius", "24px")
    if (width === 440) {
      await finishEntranceAnimations(page)
      await page.screenshot({ path: testInfo.outputPath("collect.png") })
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).click()
    await expect(dialog).toHaveCount(0)

    // A visual-only refresh must never insert the canvas's sample balances.
    await expect(app).not.toContainText("128,450.00")
    await expect(app).not.toContainText("DEMO WORKSPACE")
  })
}

test("redesigned transfer retains review, step-up approval and pending status", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 900 })
  await signInAsMerchant(page)
  await page.route("https://api.drp.test/v1/wallet/balance", (route) =>
    route.fulfill({
      json: {
        balance: 10000,
        availableBalance: 10000,
        reservedBalance: 0,
        cumulativeKrwCollections: 0,
        walletMode: "internal",
        paymentEnvironment: "sandbox",
      },
    }),
  )
  await page.route(
    "https://api.drp.test/v1/disbursement-institutions",
    (route) =>
      route.fulfill({
        json: [
          {
            code: "TEST_BANK",
            name: "Test bank",
            instapayEnabled: true,
            pesonetEnabled: true,
          },
        ],
      }),
  )
  let approvals = 0
  let submissions = 0
  await page.route(
    "https://api.drp.test/v1/security/transfer/pin",
    async (route) => {
      approvals += 1
      expect(route.request().postDataJSON().amount).toBe(100)
      await route.fulfill({ json: { stepUpToken: "mock-step-up-token" } })
    },
  )
  await page.route("https://api.drp.test/v1/disbursements", async (route) => {
    submissions += 1
    expect(route.request().headers()["x-step-up-token"]).toBe(
      "mock-step-up-token",
    )
    expect(route.request().headers()["idempotency-key"]).toBeTruthy()
    await route.fulfill({
      json: {
        id: "test-transfer",
        referenceNo: "TEST-PENDING-100",
        status: "PENDING",
      },
    })
  })
  await page.reload()
  const nav = page.getByRole("navigation", { name: "App navigation" })
  await nav.getByRole("button", { name: "Transfer", exact: true }).click()
  await page.getByRole("button", { name: "New transfer", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Bank transfer" })
  await dialog.getByLabel("Recipient full name").fill("Test recipient")
  await dialog.getByLabel("Account number", { exact: true }).fill("1234567890")
  await dialog.locator(".amount-field input").fill("100")
  await dialog
    .getByRole("button", { name: "Review transfer", exact: true })
    .click()
  await expect(
    dialog.getByRole("heading", { name: "Review transfer" }),
  ).toBeVisible()
  await expectContained(page, dialog)
  expect(approvals).toBe(0)
  expect(submissions).toBe(0)
  await dialog.getByRole("button", { name: "Continue to MPIN" }).click()
  const send = dialog.getByRole("button", { name: "Verify MPIN and send" })
  await expect(send).toBeDisabled()
  await dialog.getByLabel("Four-digit MPIN").fill("1234")
  await expect(send).toBeEnabled()
  await send.click()
  await expect(
    dialog.getByText("Transfer accepted for processing"),
  ).toBeVisible()
  await expect(dialog.getByText("Status: PENDING")).toBeVisible()
  await expect(dialog.getByText("TEST-PENDING-100")).toBeVisible()
  expect(approvals).toBe(1)
  expect(submissions).toBe(1)
  await expectContained(page, dialog)
})

test("collection QR remains pending until a provider confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 900 })
  await signInAsMerchant(page)
  await page.route("https://api.drp.test/v1/checkout/preferences", (route) =>
    route.fulfill({
      json: {
        checkoutInstructions: "Scan using your banking app.",
        emailSubject: "Payment request",
        emailMessage: "Review this payment.",
        emailBrandColor: "#2457eb",
        emailLogoUrl: "",
      },
    }),
  )
  await page.route("https://api.drp.test/v1/payment-institutions", (route) =>
    route.fulfill({
      json: [{ code: "TEST_QR", name: "Test QR bank", category: "QR" }],
    }),
  )
  let creations = 0
  await page.route("https://api.drp.test/v1/payment-links", async (route) => {
    creations += 1
    expect(route.request().headers()["idempotency-key"]).toBeTruthy()
    expect(route.request().postDataJSON()).toMatchObject({
      amount: 1250,
      institutionCode: "TEST_QR",
      description: "Test invoice 1048",
    })
    await route.fulfill({
      json: {
        id: "test-checkout",
        code: "test-checkout",
        paymentUrl: "https://sandbox.paypulse.live/checkout/test-checkout",
        qrCode: "TEST-ONLY-NOT-A-PAYMENT-CODE",
        status: "PENDING",
        amount: 1250,
        currency: "PHP",
      },
    })
  })
  await page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("button", { name: "Collect", exact: true })
    .click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Reference or note").fill("Test invoice 1048")
  await dialog.getByLabel("Amount in PHP").fill("1250")
  await dialog
    .getByRole("button", { name: "Create QR and payment link" })
    .click()
  await dialog.getByRole("option", { name: /Test QR bank/ }).click()
  expect(creations).toBe(0)
  await dialog
    .getByRole("button", { name: "Continue with Test QR bank" })
    .click()
  await expect(
    dialog.getByRole("heading", { name: "Collection ready" }),
  ).toBeVisible()
  await expect(dialog.getByText("Checkout status: PENDING")).toBeVisible()
  await expect(dialog.getByText("Payment confirmed by SwiftPay")).toHaveCount(0)
  await expect(dialog.locator(".qr-preview")).toBeVisible()
  expect(creations).toBe(1)
  await expectContained(page, dialog)
})

test("verified-device MPIN keypad preserves real approval and clears rejected input", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 440, height: 1000 })
  await page.addInitScript(() => {
    localStorage.setItem("drpay_last_merchant_email", "merchant@example.com")
    localStorage.setItem("drpay_verified_device_merchant@example.com", "true")
  })
  let signIns = 0
  await page.route("https://api.drp.test/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname === "/v1/auth/device/pin") {
      signIns += 1
      expect(route.request().postDataJSON()).toMatchObject({
        email: "merchant@example.com",
        pin: "1234",
      })
      await route.fulfill({ status: 401, json: { error: "Incorrect MPIN." } })
    } else if (pathname === "/v1/maintenance-status") {
      await route.fulfill({ json: { enabled: false } })
    } else {
      await route.fulfill({ json: {} })
    }
  })
  await page.goto("/?signin=1")
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible()
  const submit = page.getByRole("button", {
    name: "Sign in with MPIN",
    exact: true,
  })
  await expect(submit).toBeDisabled()
  for (const digit of ["1", "2", "3"])
    await page
      .getByRole("button", { name: `Enter ${digit}`, exact: true })
      .click()
  await page.getByRole("button", { name: "Delete last MPIN digit" }).click()
  for (const digit of ["3", "4"])
    await page
      .getByRole("button", { name: `Enter ${digit}`, exact: true })
      .click()
  await expect(page.getByLabel("Four-digit MPIN")).toHaveValue("1234")
  await expect(submit).toBeEnabled()
  expect(signIns).toBe(0)
  await finishEntranceAnimations(page)
  await page.screenshot({
    path: testInfo.outputPath("mpin.png"),
    fullPage: true,
  })
  await submit.click()
  await expect(page.getByRole("alert")).toContainText("Incorrect MPIN.")
  await expect(page.getByLabel("Four-digit MPIN")).toHaveValue("")
  await expect(submit).toBeDisabled()
  expect(signIns).toBe(1)
})
