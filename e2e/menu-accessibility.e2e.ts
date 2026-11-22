import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { signInAsMerchant } from "./support/merchant-session"

const NAV_LABELS = ["Home", "Wallet", "Collect", "Transfer", "Profile"]
const NAV_TABS = ["Home", "Wallet", "Transfer", "Profile"]
const QUICK_ACTION_LABELS = [
  "Collect",
  "Transfer",
  "Scan QR",
  "Activity",
  "Crypto",
  "Pendings",
  "All access",
]

function appNavigation(page: Page) {
  return page.getByRole("navigation", { name: "App navigation" })
}

async function accessibleNames(buttons: Locator) {
  return buttons.evaluateAll((elements) =>
    elements.map((el) => {
      const labelledBy = el.getAttribute("aria-labelledby")
      const label =
        el.getAttribute("aria-label") ??
        (labelledBy
          ? labelledBy
              .split(" ")
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
          : el.textContent)
      return (label ?? "").replace(/\s+/g, " ").trim()
    }),
  )
}

/** Asserts that every icon inside the menu is hidden from assistive technology. */
async function expectDecorativeIcons(container: Locator) {
  const exposedIcons = await container
    .locator("svg")
    .evaluateAll(
      (icons) =>
        icons.filter(
          (icon) =>
            icon.getAttribute("aria-hidden") !== "true" &&
            !icon.closest('[aria-hidden="true"]'),
        ).length,
    )
  expect(exposedIcons).toBe(0)
}

async function expectAxeClean(page: Page, selector: string) {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes
        .map((node) => node.target.join(" "))
        .join(", ")})`,
  )
  expect(summary, `axe violations in ${selector}`).toEqual([])
}

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused()
  const outline = await locator.evaluate((el) => {
    const style = getComputedStyle(el)
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
  })
  expect(outline.style).not.toBe("none")
  expect(outline.width).toBeGreaterThanOrEqual(2)
}

test.describe("menu accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMerchant(page)
  })

  test("menus expose correct roles and accessible names", async ({ page }) => {
    const nav = appNavigation(page)
    await expect(nav).toBeVisible()
    await expect(page.getByRole("navigation", { name: "App navigation" })).toHaveCount(1)

    const navButtons = nav.getByRole("button")
    await expect(navButtons).toHaveCount(NAV_LABELS.length)
    expect(await accessibleNames(navButtons)).toEqual(NAV_LABELS)
    for (const label of NAV_LABELS) {
      await expect(nav.getByRole("button", { name: label, exact: true })).toHaveAttribute(
        "type",
        "button",
      )
    }
    await expectDecorativeIcons(nav)

    const quickActions = page.getByRole("region", { name: "Quick actions" })
    await expect(quickActions).toBeVisible()
    const quickButtons = quickActions.getByRole("button")
    expect(await accessibleNames(quickButtons)).toEqual(QUICK_ACTION_LABELS)
    await expectDecorativeIcons(quickActions)

    await quickActions.getByRole("button", { name: "All access" }).click()
    const toolNavs = page.locator("nav.all-access-list")
    await expect(toolNavs.first()).toBeVisible()
    expect(await toolNavs.count()).toBeGreaterThan(0)
    const navNames: string[] = []
    for (const toolNav of await toolNavs.all()) {
      const navName = (await toolNav.getAttribute("aria-label"))?.trim() ?? ""
      expect(navName, "every All access menu needs an accessible name").not.toBe("")
      navNames.push(navName)
      const names = await accessibleNames(toolNav.getByRole("button"))
      expect(names.length).toBeGreaterThan(0)
      for (const name of names) expect(name).toMatch(/^\S.*: \S.*/)
      expect(new Set(names).size).toBe(names.length)
      await expectDecorativeIcons(toolNav)
    }
    expect(new Set(navNames).size, "All access menu names must be unique").toBe(navNames.length)
  })

  test("selected tab is announced with aria-current on exactly one tab", async ({
    page,
  }) => {
    const nav = appNavigation(page)
    const collect = nav.getByRole("button", { name: "Collect", exact: true })

    for (const tab of NAV_TABS) {
      await nav.getByRole("button", { name: tab, exact: true }).click()
      const current = nav.locator('[aria-current="page"]')
      await expect(current).toHaveCount(1)
      await expect(current).toHaveAccessibleName(tab)
      await expect(collect).not.toHaveAttribute("aria-current", /.+/)
      await expect(nav.getByRole("button", { name: tab, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      )
      for (const other of NAV_TABS.filter((name) => name !== tab)) {
        await expect(nav.getByRole("button", { name: other, exact: true })).not.toHaveAttribute(
          "aria-current",
          /.+/,
        )
      }
    }
  })

  test("keyboard focus is visible, follows arrow keys and survives selection", async ({
    page,
  }) => {
    const nav = appNavigation(page)
    const button = (label: string) => nav.getByRole("button", { name: label, exact: true })

    await page.keyboard.press("Shift")
    await button("Home").focus()
    await expectVisibleFocus(button("Home"))

    const expectedOrder = ["Wallet", "Collect", "Transfer", "Profile", "Home"]
    for (const label of expectedOrder) {
      await page.keyboard.press("ArrowRight")
      await expectVisibleFocus(button(label))
    }
    await page.keyboard.press("ArrowLeft")
    await expectVisibleFocus(button("Profile"))
    await page.keyboard.press("Home")
    await expectVisibleFocus(button("Home"))
    await page.keyboard.press("End")
    await expectVisibleFocus(button("Profile"))

    await page.keyboard.press("Enter")
    await expect(button("Profile")).toHaveAttribute("aria-current", "page")
    await expectVisibleFocus(button("Profile"))

    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press(" ")
    await expect(button("Transfer")).toHaveAttribute("aria-current", "page")
    await expectVisibleFocus(button("Transfer"))

    await page.keyboard.press("Home")
    await page.keyboard.press("Enter")
    await expect(button("Home")).toHaveAttribute("aria-current", "page")

    const quickButtons = page.getByRole("region", { name: "Quick actions" }).getByRole("button")
    await quickButtons.first().focus()
    await expectVisibleFocus(quickButtons.first())
    for (let index = 1; index < QUICK_ACTION_LABELS.length; index += 1) {
      await page.keyboard.press("Tab")
      await expectVisibleFocus(quickButtons.nth(index))
    }

    await page.keyboard.press("Shift+Tab")
    await expectVisibleFocus(quickButtons.nth(QUICK_ACTION_LABELS.length - 2))
    await quickButtons.last().focus()
    await page.keyboard.press("Enter")
    const firstTool = page.locator("nav.all-access-list").first().getByRole("button").first()
    await firstTool.focus()
    await expectVisibleFocus(firstTool)
    await page.keyboard.press("Tab")
    await expect(page.locator(":focus")).toHaveCount(1)
    await expectVisibleFocus(page.locator(":focus"))
  })

  test("menus have no axe WCAG A/AA violations", async ({ page }) => {
    await expectAxeClean(page, ".bottom-nav")
    await expectAxeClean(page, ".quick-actions")
    await page.getByRole("region", { name: "Quick actions" }).getByRole("button", { name: "All access" }).click()
    await expect(page.locator(".all-access-page")).toBeVisible()
    await expectAxeClean(page, ".all-access-page")
  })
})
