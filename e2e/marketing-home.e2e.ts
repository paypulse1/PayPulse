import { expect, test } from "@playwright/test"

test("marketing homepage presents the PayPulse transfer flow", async ({
  page,
}) => {
  await page.goto("/marketing")

  await expect(
    page.getByRole("heading", { name: "Payments, made clearer." }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Go to merchant sign[- ]in/i }),
  ).toHaveAttribute("href", /\/login/)

  const transferScreens = page.locator(".drpay-phone-frame img")
  await expect(transferScreens).toHaveCount(2)
  await expect
    .poll(() =>
      transferScreens.evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true)

  await expect(
    page.getByRole("img", { name: "PayPulse bank and wallet selection screen" }),
  ).toHaveAttribute("src", "/IMG_20261101_183405_701.jpg")
  await expect(
    page.getByRole("img", {
      name: "PayPulse transfer form with recipient and amount fields",
    }),
  ).toHaveAttribute("src", "/IMG_20261101_183405_888.jpg")

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Open menu" }).click()
  await page
    .locator("#drpay-nav-panel")
    .getByRole("link", { name: "Getting started" })
    .click()
  await expect(page.locator("#drpay-nav-panel")).toHaveAttribute("data-open", "false")
  await expect(
    page.getByRole("heading", { name: "A considered start. A clearer day." }),
  ).toBeVisible()

  await page.emulateMedia({ reducedMotion: "reduce" })
  await expect(
    page.getByRole("heading", { name: "Payments, made clearer." }),
  ).toBeVisible()
  await expect(page.locator(".drpay-phone-frame img")).toHaveCount(2)
})
