import { expect, test } from "@playwright/test"

test("marketing page shows credited sector photography and sourced updates", async ({
  page,
}) => {
  await page.goto("/")

  const stories = page.locator(".merchant-scenes")
  await stories.scrollIntoViewIfNeeded()
  await expect(stories).toHaveAttribute("data-visible", "true")
  await expect(
    page.getByRole("img", { name: /Roulette wheel in a physical casino/ }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("img", { name: /Currency exchange kiosks/ }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("img", { name: /cryptocurrency wallet/ }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("img", { name: /Philippine Stock Exchange Center/ }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("img", { name: /Yeouido financial district/ }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("img", { name: /mobile phone with a payment terminal/ }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("img", { name: /card reader payment terminal/ }),
  ).toHaveCount(1)
  await expect(page.locator(".photo-credit")).toHaveCount(7)

  const photos = page.locator(".merchant-scene-photo img")
  await expect(photos).toHaveCount(7)
  await expect
    .poll(() =>
      photos.evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true)

  const updates = page.locator(".market-updates")
  await updates.scrollIntoViewIfNeeded()
  await expect(updates).toHaveAttribute("data-visible", "true")
  await expect(page.locator(".market-update-card")).toHaveCount(4)
  await expect(
    page.getByRole("heading", {
      name: "Paymentology partners with Asia United Bank",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "SPiCE International 2026 · Cebu" }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Read Paymentology’s announcement/ }),
  ).toHaveAttribute(
    "href",
    "https://www.paymentology.com/newsroom/paymentology-powers-asia-united-banks-digital-payments-surge-in-the-philippines",
  )
  await expect(page.locator(".market-update-card time")).toHaveCount(4)

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload()
  const reducedMotionStories = page.locator(".merchant-scenes")
  await reducedMotionStories.scrollIntoViewIfNeeded()
  await expect(reducedMotionStories).toHaveCSS("opacity", "1")
})
