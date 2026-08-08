import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", name: "public product page" },
  { path: "/login", name: "login page" },
  { path: "/register", name: "registration page" },
  { path: "/forgot-password", name: "password recovery page" },
  { path: "/reset-password", name: "password reset page" },
  { path: "/verify-email", name: "email verification page" },
] as const;

for (const route of routes) {
  test(`${route.name} has no automated WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("login is operable with the keyboard", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const skipLink = page.getByRole("link", {
    name: /skip to main content/i,
  });
  const emailInput = page.getByRole("textbox", { name: /email address/i });
  const passwordInput = page.getByLabel(/^password$/i);
  const passwordToggle = page.locator('button[aria-pressed]').first();

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);

  await emailInput.focus();
  await expect(emailInput).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(passwordInput).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(passwordToggle).toBeFocused();
});

const authenticatedEmail = process.env.E2E_EMAIL;
const authenticatedPassword = process.env.E2E_PASSWORD;
const requireAuthenticatedAccessibility = Boolean(process.env.CI);
const allowAuthenticatedMutations = process.env.E2E_ALLOW_MUTATIONS === "true";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3100/backend";

test.describe("authenticated accessibility", () => {
  test.skip(
    !requireAuthenticatedAccessibility && (!authenticatedEmail || !authenticatedPassword),
    "Set E2E_EMAIL and E2E_PASSWORD to audit the signed-in dashboard.",
  );

  test.beforeAll(() => {
    if (requireAuthenticatedAccessibility && (!authenticatedEmail || !authenticatedPassword)) {
      throw new Error("CI requires authenticated credentials for dashboard accessibility coverage.");
    }
    if (requireAuthenticatedAccessibility && !allowAuthenticatedMutations) {
      throw new Error("CI requires E2E_ALLOW_MUTATIONS=true for workspace accessibility coverage.");
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");

    const emailInput = page.getByRole("textbox", { name: /email/i });
    const passwordInput = page.getByLabel(/password/i);
    const signInButton = page.getByRole("button", { name: /sign in/i });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await emailInput.click();
    await emailInput.fill("");
    await emailInput.pressSequentially(authenticatedEmail || "", { delay: 5 });

    await passwordInput.click();
    await passwordInput.fill("");
    await passwordInput.pressSequentially(authenticatedPassword || "", { delay: 5 });

    await expect(emailInput).toHaveValue(authenticatedEmail || "");
    await expect(passwordInput).toHaveValue(authenticatedPassword || "");
    await expect(signInButton).toBeEnabled({ timeout: 15_000 });
    await signInButton.click();
    await expect(page).toHaveURL(/\/app(?:\?.*)?$/);
  });

  for (const route of [
    { path: "/app", name: "project dashboard" },
    { path: "/account", name: "account security page" },
    { path: "/notifications", name: "notification inbox" },
  ] as const) {
    test(`${route.name} has no automated WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("review workspace has no automated WCAG A/AA violations", async ({ page }) => {
    test.skip(!allowAuthenticatedMutations, "Workspace accessibility requires a disposable database.");
    const title = `Accessible workspace ${Date.now()}`;
    const created = await page.request.post(`${apiUrl}/api/projects`, {
      data: { title, description: "Disposable workspace accessibility audit." },
    });
    expect(created.ok()).toBeTruthy();
    const project = await created.json() as { id: string; version: number };

    try {
      await page.goto(`/project/${project.id}`);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      const workspace = await page.request.get(`${apiUrl}/api/projects/workspace/${project.id}`);
      const expectedVersion = workspace.ok()
        ? ((await workspace.json()) as { version: number }).version
        : project.version;
      await page.request.delete(`${apiUrl}/api/projects/${project.id}`, { data: { expectedVersion } });
    }
  });
});

test("public surfaces remain usable with reduced motion and forced colours", async ({ page, browserName }, testInfo) => {
  test.skip(
    browserName !== "chromium" ||
      Boolean(testInfo.project.use.isMobile),
    "Forced-colour emulation is validated in desktop Chromium.",
  );

  await page.emulateMedia({
    reducedMotion: "reduce",
    forcedColors: "active",
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /create account/i }).first()).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  // Axe evaluates author colours rather than the system colours that Chromium
  // actually renders in forced-colour mode. Normal-mode tests retain complete
  // automated colour-contrast coverage.
  expect(
    results.violations.filter((violation) => violation.id !== "color-contrast"),
  ).toEqual([]);

  const forcedColourState = await page.evaluate(() => {
    function parseColour(value: string): [number, number, number, number] {
      const channels = value.match(/[\d.]+/gu)?.map(Number) ?? [];

      if (channels.length < 3) {
        throw new Error(`Unsupported computed colour: ${value}`);
      }

      return [
        channels[0],
        channels[1],
        channels[2],
        channels[3] ?? 1,
      ];
    }

    function luminance([red, green, blue]: [number, number, number, number]) {
      const channels = [red, green, blue].map((channel) => {
        const normalized = channel / 255;

        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });

      return (
        (0.2126 * channels[0]) +
        (0.7152 * channels[1]) +
        (0.0722 * channels[2])
      );
    }

    function contrastRatio(
      foreground: [number, number, number, number],
      background: [number, number, number, number],
    ) {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));

      return (lighter + 0.05) / (darker + 0.05);
    }

    function effectiveBackground(element: HTMLElement) {
      let current: HTMLElement | null = element;

      while (current) {
        const background = parseColour(
          getComputedStyle(current).backgroundColor,
        );

        if (background[3] > 0) {
          return background;
        }

        current = current.parentElement;
      }

      return parseColour(getComputedStyle(document.body).backgroundColor);
    }

    const selectors = {
      authTitle: "#auth-title",
      emailLabel: 'label[for="login-email"]',
      passwordToggle: 'button[aria-pressed]',
      authFooter: ".ff-auth-footer",
      accountLink: ".ff-auth-footer a",
      siteFooter: "footer p",
    };

    const ratios: Record<string, number> = {};

    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector<HTMLElement>(selector);

      if (!element) {
        throw new Error(`Missing forced-colour test element: ${selector}`);
      }

      ratios[name] = contrastRatio(
        parseColour(getComputedStyle(element).color),
        effectiveBackground(element),
      );
    }

    return {
      active: matchMedia("(forced-colors: active)").matches,
      ratios,
    };
  });

  expect(forcedColourState.active).toBe(true);

  for (const ratio of Object.values(forcedColourState.ratios)) {
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});

test("public pages remain operable at 400 percent zoom", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CSS zoom coverage is validated in Chromium.");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/login");
  await page.evaluate(() => { document.documentElement.style.zoom = "400%"; });
  await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
