import { expect, test, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eOrganization, personaKeys, personas, personaStorageState, type PersonaKey } from "./personas";

async function personaContext(browser: Browser, persona: PersonaKey) {
  return browser.newContext({ storageState: personaStorageState(persona) });
}

async function pageFor(browser: Browser, persona: PersonaKey) {
  const context = await personaContext(browser, persona);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[browser page error] ${error.stack ?? error.message}`));
  return { context, page };
}

async function expectResponsiveSurface(page: Page) {
  await expect(page.locator("main, .organization-workspace").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const overlaps = await page.locator("button:visible, a.button:visible").evaluateAll((elements) => {
    const rectangles = elements.map((element) => ({ element, rectangle: element.getBoundingClientRect() })).filter(({ rectangle }) => rectangle.width > 1 && rectangle.height > 1);
    return rectangles.flatMap((left, index) => rectangles.slice(index + 1).map((right) => {
      const width = Math.min(left.rectangle.right, right.rectangle.right) - Math.max(left.rectangle.left, right.rectangle.left);
      const height = Math.min(left.rectangle.bottom, right.rectangle.bottom) - Math.max(left.rectangle.top, right.rectangle.top);
      return width > 2 && height > 2 && !left.element.contains(right.element) && !right.element.contains(left.element);
    })).filter(Boolean).length;
  });
  expect(overlaps).toBe(0);
}

async function openChannel(page: Page, name: string) {
  const mobileChannels = page.getByRole("button", { name: /Channels/ });
  if (await mobileChannels.isVisible()) await mobileChannels.click();
  await page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).click();
}

test.describe.configure({ mode: "serial" });

test("all twelve authenticated personas establish a verified application session", async ({ browser }) => {
  for (const persona of personaKeys) {
    const context = await personaContext(browser, persona);
    const response = await context.request.get("/api/v1/session");
    expect(response.ok(), `${persona} should have an authenticated session`).toBe(true);
    const body = await response.json();
    expect(body.data?.profile?.handle ?? body.data?.handle).toBe(personas[persona].handle);
    await context.close();
  }
});

test("private message requests never invoke shared-text moderation", async ({ browser }, testInfo) => {
  const context = await personaContext(browser, "studentA");
  const target = testInfo.project.name === "desktop-chromium" ? "studentB" : "organizationMember";
  const profileResponse = await context.request.get(`/api/v1/profiles/${personas[target].handle}`);
  const profile = await profileResponse.json();
  expect(profileResponse.ok(), JSON.stringify(profile)).toBe(true);
  const response = await context.request.post("/api/v1/conversation-requests", {
    headers: { origin: "http://127.0.0.1:3100", "content-type": "application/json" },
    data: {
      profileId: profile.data.id,
      openingMessage: `CE test unavailable private request ${testInfo.project.name}`,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  const result = await response.json();
  expect(response.ok(), JSON.stringify(result)).toBe(true);
  await context.close();
});

test("profiles, gallery, organization tab, friendship state, and people search are responsive", async ({ browser }) => {
  const { context, page } = await pageFor(browser, "studentA");
  await page.goto(`/u/${personas.studentA.handle}`);
  await expect(page.getByRole("heading", { name: "Student A" })).toBeVisible();
  for (const tab of ["Posts", "Listings", "Events", "Organizations", "About"]) await expect(page.getByRole("tab", { name: tab, exact: true })).toBeVisible();
  await expect(page.getByText("Authenticated profile gallery fixture")).toBeVisible();
  await page.getByRole("tab", { name: "Organizations", exact: true }).click();
  await expect(page.getByText("No organizations to show")).toBeVisible();
  await expectResponsiveSurface(page);

  await page.goto(`/u/${personas.studentB.handle}`);
  await expect(page.getByText("Request sent")).toBeVisible();
  await page.goto(`/people?q=${encodeURIComponent("Organization")}`);
  await expect(page.getByRole("region", { name: "Member search results" })).toBeVisible();
  await expect(page.getByText("Organization Owner")).toBeVisible();
  await expectResponsiveSurface(page);
  await context.close();
});

test("profile is the canonical posting hub with responsive URL-addressable tabs", async ({ browser }, testInfo) => {
  const { context, page } = await pageFor(browser, "studentA");
  await page.goto("/profile?tab=posts");
  await expect(page).toHaveURL(new RegExp(`/u/${personas.studentA.handle}\\?tab=posts`));
  await expect(page.locator(".profile-tab-scroller")).toHaveAttribute("data-interactive", "true", { timeout: 15_000 });
  const tabs = page.getByRole("tablist", { name: "Profile sections" }).getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Share with your campus" })).toBeVisible();
  if (testInfo.project.name === "desktop-chromium") {
    const tops = await tabs.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  } else {
    const metrics = await page.locator(".profile-tab-scroller").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  }
  await page.getByRole("tab", { name: "Posts", exact: true }).press("End");
  await expect(page).toHaveURL(/tab=about/);
  await expect(page.getByRole("heading", { name: "About", level: 2 })).toBeVisible();
  await expectResponsiveSurface(page);
  await context.close();
});

test("personal posts are created on profile and discovered through Social", async ({ browser }, testInfo) => {
  const { context, page } = await pageFor(browser, "studentA");
  const body = `Step 2A integrated ${testInfo.project.name} ${Date.now()}`;
  await page.goto(`/u/${personas.studentA.handle}?tab=posts&compose=1`);
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
  await context.close();
});

test("shared-text moderation preserves drafts and connects contextual review", async ({ browser }, testInfo) => {
  const { context, page } = await pageFor(browser, "studentA");
  const draft = `CE test review ${testInfo.project.name} ${Date.now()}`;
  await page.goto(`/u/${personas.studentA.handle}?tab=posts&compose=1`);
  await expect(page.locator(".social-composer-form")).toHaveAttribute("data-interactive", "true", { timeout: 15_000 });
  await page.getByLabel("Post text").fill(draft);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".social-composer-form .form-error[role='alert']")).toContainText("needs a safety review");
  await expect(page.getByLabel("Post text")).toHaveValue(draft);
  await expect(page.locator(".social-post-card").filter({ hasText: draft })).toHaveCount(0);
  await page.getByRole("button", { name: "Request staff review" }).click();
  await expect(page.getByRole("status")).toContainText("Staff review requested");
  await page.screenshot({ path: testInfo.outputPath(`moderation-review-${testInfo.project.name}.png`), fullPage: true });
  await expectResponsiveSurface(page);
  await context.close();
});

test("Home previews community activity without a duplicate composer", async ({ browser }) => {
  const { context, page } = await pageFor(browser, "studentA");
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "From your community" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Share with your campus" })).toHaveCount(0);
  await expectResponsiveSurface(page);
  await context.close();
});

test("member messaging, announcement restrictions, restricted-channel invisibility, and reporting work", async ({ browser }, testInfo) => {
  const { context, page } = await pageFor(browser, "organizationMember");
  await page.goto(`/organizations/${e2eOrganization.slug}`);
  await expect(page.getByText(e2eOrganization.name, { exact: true }).first()).toBeAttached();
  await expect(page.getByRole("button", { name: /officer-room/i })).toHaveCount(0);
  await openChannel(page, "general");
  const message = `Playwright ${testInfo.project.name} member message`;
  await page.getByLabel("Message general").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(message)).toBeVisible();
  await openChannel(page, "announcements");
  await expect(page.getByLabel("Message announcements")).toBeDisabled();
  await page.getByRole("button", { name: "Report channel" }).click();
  await expect(page.getByRole("dialog", { name: /Report organization channel/ })).toBeVisible();
  await page.getByLabel("What happened?").fill("Authenticated browser report coverage.");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("status")).toContainText("Report submitted");
  await context.close();
});

test("officer sees restricted channels while nonmembers discover no channel metadata", async ({ browser }) => {
  const officer = await pageFor(browser, "organizationOfficer");
  await officer.page.goto(`/organizations/${e2eOrganization.slug}`);
  await expect(officer.page.getByRole("button", { name: /officer-room/i })).toBeVisible();
  await openChannel(officer.page, "officer-room");
  await expect(officer.page.getByLabel("Message officer-room")).toBeEnabled();
  await officer.context.close();

  const outsider = await pageFor(browser, "unauthorizedNonmember");
  const response = await outsider.context.request.get(`/api/v1/organizations/${e2eOrganization.slug}/channels`);
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.data.channels).toEqual([]);
  expect(payload.data.categories).toEqual([]);
  expect(payload.data.roles).toEqual([]);
  await outsider.page.goto(`/organizations/${e2eOrganization.slug}`);
  await expect(outsider.page.getByRole("button", { name: /officer-room/i })).toHaveCount(0);
  await outsider.context.close();
});

test("owner can create and assign a custom role, set role/member overrides, and read audit history", async ({ browser }, testInfo) => {
  const { context, page } = await pageFor(browser, "organizationOwner");
  await page.goto(`/organizations/${e2eOrganization.slug}`);
  const mobileChannels = page.locator(".workspace-topbar button").first();
  if (await mobileChannels.isVisible()) {
    await mobileChannels.click();
    await expect(page.locator(".workspace-sidebar.open")).toBeVisible();
  }
  await page.getByRole("button", { name: "Workspace settings" }).evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByRole("dialog", { name: /Roles, permissions & audit/ })).toBeVisible();

  if (testInfo.project.name === "mobile-chromium") {
    const created = await context.request.put(`/api/v1/organizations/${e2eOrganization.slug}/roles`, {
      headers: { origin: "http://127.0.0.1:3100", "content-type": "application/json" },
      data: { action: "create", name: `Release Helper ${testInfo.project.name}`, color: "#476657", authorityRank: 20, sortPosition: 70, permissions: ["view_organization", "view_channels", "send_messages"] },
    });
    const createdBody = await created.json();
    expect(created.ok(), JSON.stringify(createdBody)).toBe(true);
  } else {
    const answers = [`Release Helper ${testInfo.project.name}`, "#476657", "20", "70", "view_organization,view_channels,send_messages"];
    page.on("dialog", async (dialog) => dialog.accept(answers.shift() ?? ""));
    await page.getByRole("button", { name: "Create custom role" }).click();
    await expect(page.getByText(`Release Helper ${testInfo.project.name}`)).toBeVisible();
  }
  const [workspaceResponse, organizationResponse] = await Promise.all([
    context.request.get(`/api/v1/organizations/${e2eOrganization.slug}/channels`),
    context.request.get(`/api/v1/organizations/${e2eOrganization.slug}`),
  ]);
  const [workspace, organization] = await Promise.all([workspaceResponse.json(), organizationResponse.json()]);
  const customRole = workspace.data.roles.find((role: { name: string }) => role.name === `Release Helper ${testInfo.project.name}`);
  const administrator = organization.data.members.find((member: { role: string }) => member.role === "administrator");
  const assigned = await context.request.post(`/api/v1/organizations/${e2eOrganization.slug}/roles`, {
    headers: { origin: "http://127.0.0.1:3100", "content-type": "application/json" },
    data: { roleId: customRole.id, profileId: administrator.profile_id, action: "assign", reason: "Authenticated browser role assignment" },
  });
  expect(assigned.ok()).toBe(true);

  await page.getByRole("button", { name: "Channel permissions" }).click();
  await expect(page.getByText(/Your resolved access/)).toBeVisible();
  await page.getByLabel("Override target").selectOption("role");
  await page.getByLabel("View channel").selectOption("allow");
  await page.getByLabel("Send messages").selectOption("allow");
  await page.getByRole("button", { name: "Save override" }).click();
  await expect(page.getByRole("status")).toContainText("saved and audited");
  await page.getByLabel("Override target").selectOption("member");
  await page.getByLabel("View channel").selectOption("allow");
  await page.getByRole("button", { name: "Save override" }).click();
  await expect(page.getByRole("status")).toContainText("saved and audited");

  await page.getByRole("button", { name: "Audit history" }).click();
  await expect(page.getByRole("heading", { name: "Organization audit history" })).toBeVisible();
  await expect(page.locator(".workspace-audit article").first()).toBeVisible();
  await context.close();
});

test("student appeal surface and MFA-protected moderation appeal handling are available", async ({ browser }, testInfo) => {
  const student = await pageFor(browser, "studentB");
  await student.page.goto("/appeals");
  await expect(student.page.getByRole("heading", { name: /profile outcome/i })).toBeVisible();
  await expect(student.page.getByText(/Appeal (open|reviewing)/i)).toBeVisible();
  await student.context.close();

  const staff = await pageFor(browser, "platformModerator");
  await staff.page.goto("/admin");
  await expect(staff.page.getByRole("heading", { name: "Safety center" })).toBeVisible();
  await expect(staff.page.getByText(/Platform scope.*MFA protected/)).toBeVisible();
  await expect(staff.page.getByRole("heading", { name: "Appeal review" })).toBeVisible();
  const assignReviewer = staff.page.getByRole("button", { name: "Assign reviewer" });
  await expect(assignReviewer).toBeVisible();
  if (testInfo.project.name === "desktop-chromium") {
    const answers = ["Independent reviewer assigned during authenticated release testing.", ""];
    staff.page.on("dialog", async (dialog) => dialog.accept(answers.shift() ?? ""));
    await assignReviewer.click();
    await expect(staff.page.getByRole("status")).toContainText("Appeal updated");
  }
  await staff.context.close();
});

test("registration preserves the University of Michigan shared-domain decision", async ({ page }) => {
  const institutions = await page.request.get("/api/v1/institutions?q=University%20of%20Michigan&limit=20");
  expect(institutions.ok()).toBe(true);
  const directory = await institutions.json();
  const annArbor = directory.data.find((entry: { name: string }) => entry.name.includes("Ann Arbor"));
  expect(annArbor).toBeTruthy();
  const response = await page.request.post("/api/v1/auth/register/start", {
    headers: { origin: "http://127.0.0.1:3100", "content-type": "application/json" },
    data: { institutionId: annArbor.id, email: "ce.e2e.shared@umich.edu", turnstileToken: "local-e2e" },
  });
  const body = await response.json();
  if (response.ok()) {
    expect(body.data.outcome).toBe("AMBIGUOUS_OR_SHARED_DOMAIN");
    expect(body.data.domain).toBe("umich.edu");
  } else {
    expect(response.status(), JSON.stringify(body)).toBe(503);
    expect(body.error.details).toMatchObject({
      outcome: "GLOBAL_SERVICE_UNAVAILABLE",
      registrationOutcome: "AMBIGUOUS_OR_SHARED_DOMAIN",
      domain: "umich.edu",
    });
  }
});

test("authenticated shell has no serious accessibility violations", async ({ browser }) => {
  const { context, page } = await pageFor(browser, "studentA");
  await page.goto(`/u/${personas.studentA.handle}`);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  await expectResponsiveSurface(page);
  await context.close();
});
