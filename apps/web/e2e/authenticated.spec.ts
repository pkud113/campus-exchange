import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const fixtureHandle = (projectName: string) => projectName.startsWith("mobile") ? "playwright_mobile" : "playwright_student";

test.beforeEach(async ({ page }, testInfo) => {
  const handle = fixtureHandle(testInfo.project.name);
  const response = await page.request.post("/api/v1/auth/login", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { identifier: handle, password: "CampusAlpha123!", turnstileToken: "local-e2e", next: "/home" },
  });
  if (!response.ok()) throw new Error(`Local fixture sign-in failed (${response.status()}): ${await response.text()}`);
});

test("profile is the canonical posting hub with responsive accessible tabs", async ({ page }, testInfo) => {
  await page.goto("/profile?tab=posts");
  await expect(page).toHaveURL(new RegExp(`/u/${fixtureHandle(testInfo.project.name)}\\?tab=posts`));
  await expect(page.getByRole("heading", { name: "Alex Morgan", level: 1 })).toBeVisible();
  await expect(page.locator(".profile-tab-scroller")).toHaveAttribute("data-interactive", "true", { timeout: 15_000 });
  const tabs = page.getByRole("tablist", { name: "Profile sections" }).getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Share with your campus" })).toBeVisible();
  if (testInfo.project.name.startsWith("desktop")) {
    const tops = await tabs.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  } else {
    const metrics = await page.locator(".profile-tab-scroller").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  }
  await tabs.filter({ hasText: "About" }).click();
  await expect(page).toHaveURL(/tab=about/);
  await expect(page.getByRole("heading", { name: "About Alex Morgan" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
});

test("personal posts are created on profile and discovered through Social", async ({ page }, testInfo) => {
  const body = `Step 2A ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/profile?tab=posts&compose=1");
  await expect(page.locator(".social-composer-form")).toHaveAttribute("data-interactive", "true", { timeout: 15_000 });
  await page.getByLabel("Post text").fill(body);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Post published.", { exact: true })).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();
  await page.goto("/social");
  await expect(page.getByRole("heading", { name: "Discover what’s happening" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Share with your campus" })).toHaveCount(0);
  await expect(page.getByText(body)).toBeVisible();
  await page.getByRole("tab", { name: "Campus" }).click();
  await expect(page).toHaveURL(/scope=campus/);
  await expect(page.getByText(body)).toBeVisible();
});

test("Home previews community activity without a duplicate composer", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "From your community" })).toBeVisible();
  await expect(page.getByText(/Welcome to the Campus Alpha community feed/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Share with your campus" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
