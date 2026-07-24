import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const path of ["/", "/safety", "/register", "/sign-in"]) {
  test(`${path} is usable and has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
}

test("registration exposes searchable college and school-email controls", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create your account." })).toBeVisible();
  await expect(page.getByLabel(/college/i)).toBeVisible();
  await expect(page.getByLabel(/school.*email/i)).toBeVisible();
});

test("institution combobox supports asynchronous keyboard selection", async ({ page }) => {
  await page.goto("/register");
  const combobox = page.getByRole("combobox", { name: "College or university" });
  await combobox.fill("University of Michigan Ann Arbor");
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await combobox.press("ArrowDown");
  await expect(combobox).toHaveAttribute("aria-activedescendant", /option-0$/);
  await combobox.press("Enter");
  await expect(combobox).toHaveValue(/University of Michigan/i);
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
});

test("theme and keyboard focus remain usable across the public shell", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("campus-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const outline = await focused.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});
