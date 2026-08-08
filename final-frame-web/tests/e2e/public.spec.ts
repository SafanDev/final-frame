import { expect, test } from "@playwright/test";

test.describe("public and authentication surfaces", () => {
  test("public product page exposes useful metadata and navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/FinalFrame/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonicalHref).not.toBeNull();
    expect(new URL(canonicalHref ?? "", page.url()).pathname).toBe("/");
    const structuredDataScripts = page.locator('script[type="application/ld+json"]');
    await expect(structuredDataScripts).toHaveCount(1);
    const structuredDataText = await structuredDataScripts.first().textContent();
    const structuredData = JSON.parse(
      structuredDataText ?? "null",
    ) as {
      "@type"?: string;
      applicationCategory?: string;
      operatingSystem?: string;
    };
    expect(structuredData).toMatchObject({
      "@type": "SoftwareApplication",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
    });
    await expect(
      page.getByRole("link", {
        name: /create account|start a review|create a workspace/i,
      }).first(),
    ).toBeVisible();
  });

  test("login and registration forms have accessible names and autocomplete", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: /email/i })).toHaveAttribute("autocomplete", "email");
    await expect(page.getByLabel(/password/i)).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    await page.goto("/register");
    await expect(page.getByRole("textbox", { name: /full name/i })).toHaveAttribute("autocomplete", "name");
    await expect(page.getByLabel(/^password/i)).toHaveAttribute("autocomplete", "new-password");
  });


  test("invitation secrets move out of the address bar before sign-in", async ({ page }) => {
    const token = "a".repeat(64);
    await page.goto(`/invite#token=${token}`);
    await expect(page).toHaveURL(/\/invite$/);
    await expect(page.getByRole("heading", { name: /project invitation/i })).toBeVisible();
    const stored = await page.evaluate(() => window.sessionStorage.getItem("finalframe.invitation-token"));
    expect(stored).toBe(token);
    const signIn = page
      .getByLabel("Project invitation")
      .getByRole("link", { name: /^sign in$/i });
    await expect(signIn).toHaveAttribute("href", "/login?callbackUrl=%2Finvite");
  });

  test("public registration does not expose role escalation controls", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /^create account$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^create account$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /designer create and deliver projects/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /client review invited projects/i })).toHaveCount(0);
  });

  test("password reset and verification tokens leave the address bar immediately", async ({ page }) => {
    const token = "b".repeat(64);
    await page.goto(`/reset-password#token=${token}`);
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByRole("textbox", { name: "New password", exact: true })).toBeVisible();

    await page.goto(`/verify-email#token=${token}`);
    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.getByRole("heading", { name: /^verify email$/i })).toBeVisible();
  });

  test("private dashboard redirects unauthenticated visitors to login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fapp/);
  });

  test("metadata and health endpoints are valid", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toMatchObject({ status: "ok", service: "FinalFrame Web" });

    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toContain("sitemap.xml");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain("<loc>");

    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBeTruthy();
    expect((await manifest.json()).name).toContain("FinalFrame");
  });

  test("security and indexing headers are present", async ({ request }) => {
    const publicResponse = await request.get("/");
    expect(publicResponse.headers()["content-security-policy"]).toContain("default-src 'self'");
    expect(publicResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(publicResponse.headers()["x-frame-options"]).toBe("DENY");

    const privateResponse = await request.get("/login");
    expect(privateResponse.headers()["x-robots-tag"]).toContain("noindex");
    expect(privateResponse.headers()["cache-control"]).toContain("no-store");
  });
});
