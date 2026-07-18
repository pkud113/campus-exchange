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
