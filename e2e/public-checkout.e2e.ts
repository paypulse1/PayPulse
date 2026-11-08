import { expect, test } from "@playwright/test"

const checkoutCode = "e2echeckoutcode0123456789abcdefghijklmno"

test("customer can view a hosted PHP checkout and payment instructions", async ({
  page,
}) => {
  let requests = 0
  await page.route(
    "https://api.drp.test/v1/public/checkout/**",
    async (route) => {
      requests += 1
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          title: "Test invoice",
          referenceNo: "DRP-E2E-CHECKOUT",
          amount: 125,
          currency: "PHP",
          status: "PENDING",
          statusCheckUnavailable: false,
          qrCode: "sample-qr-payload",
          isTaxInvoice: false,
          institutionName: "Test Bank",
          checkoutInstructions:
            "Open your bank app.\nScan the QR code.\nConfirm the PHP amount.",
        }),
      })
    },
  )

  await page.goto(`/checkout/${checkoutCode}`)

  await expect(
    page.getByRole("heading", { name: "Test invoice" }),
  ).toBeVisible()
  await expect(page.getByText("PHP 125.00")).toBeVisible()
  await expect(page.getByRole("status")).toContainText("Waiting for payment")
  await expect(
    page.getByRole("img", { name: "Scan this QRPH payment code" }),
  ).toBeVisible()
  await expect(page.getByText("Confirm the PHP amount.")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Copy payment reference" }),
  ).toContainText("DRP-E2E-CHECKOUT")
  expect(requests).toBe(1)
})
