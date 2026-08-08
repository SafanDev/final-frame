import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const clientEmail = process.env.E2E_CLIENT_EMAIL;
const clientPassword = process.env.E2E_CLIENT_PASSWORD;
const allowMutations = process.env.E2E_ALLOW_MUTATIONS === "true";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3100/backend";
const requireCredentials = Boolean(process.env.CI);


const reviewPng = readFileSync(
  resolve(
    process.cwd(),
    "tests",
    "e2e",
    "fixtures",
    "review.png",
  ),
);

interface E2eAsset {
  id: string;
  fileName: string;
  processingStatus: "PENDING" | "PROCESSING" | "CLEAN" | "REJECTED";
  processingError: string | null;
}

async function waitForCleanAsset(page: Page, projectId: string, assetId: string): Promise<E2eAsset> {
  let asset: E2eAsset | undefined;
  await expect.poll(async () => {
    const response = await page.request.get(`${apiUrl}/api/projects/${projectId}/assets?limit=25`);
    if (!response.ok()) return `HTTP_${response.status()}`;
    const body = await response.json() as { items: E2eAsset[] };
    asset = body.items.find((candidate) => candidate.id === assetId);
    return asset?.processingStatus === "REJECTED"
      ? `REJECTED: ${asset.processingError ?? "No processing error was returned."}`
      : asset?.processingStatus ?? "MISSING";
  }, {
    message: "The uploaded image should pass scanning and preview processing.",
    timeout: 180_000,
    intervals: [500, 1_000, 2_000, 5_000],
  }).toBe("CLEAN");

  if (!asset) throw new Error("Processed E2E asset was not returned by the API.");
  return asset;
}

async function login(page: Page, accountEmail: string, accountPassword: string): Promise<void> {
  await page.goto("/login");
  const emailInput = page.getByRole("textbox", { name: /email/i });
  const passwordInput = page.getByLabel(/password/i);
  const signInButton = page.getByRole("button", { name: /sign in/i });

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();

  await emailInput.click();
  await emailInput.fill("");
  await emailInput.pressSequentially(accountEmail, { delay: 5 });

  await passwordInput.click();
  await passwordInput.fill("");
  await passwordInput.pressSequentially(accountPassword, { delay: 5 });

  await expect(emailInput).toHaveValue(accountEmail);
  await expect(passwordInput).toHaveValue(accountPassword);
  await expect(signInButton).toBeEnabled({ timeout: 15_000 });
  await signInButton.click();
  await expect(page).toHaveURL(/\/app(?:\?.*)?$/);
}

test.describe("authenticated integration", () => {
  test.skip(!requireCredentials && (!email || !password), "Set E2E_EMAIL and E2E_PASSWORD to run authenticated tests.");

  test.beforeAll(() => {
    if (requireCredentials && (!email || !password || !clientEmail || !clientPassword)) {
      throw new Error("CI requires project owner and client credentials for authenticated browser coverage.");
    }
  });

  test.beforeEach(async ({ page }) => {
    await login(page, email || "", password || "");
  });

  test("loads the protected project dashboard", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Your projects", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New project", exact: true })).toBeVisible();
  });

  test("opens account security with a revocable database-backed session", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: /^account$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Download your data", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^sign out everywhere$/i })).toBeVisible();

    const deleteCard = page
      .getByRole("heading", { name: /^delete account$/i })
      .locator("xpath=ancestor::form");

    await expect(deleteCard.getByLabel(/^password$/i)).toHaveCount(0);

    await deleteCard.getByRole("button", { name: /^delete$/i }).click();

    const deleteButton = deleteCard.getByRole("button", {
      name: /^delete account$/i,
    });

    await expect(deleteButton).toBeDisabled();

    await deleteCard.getByLabel(/^password$/i).fill(password || "");
    await deleteCard.getByLabel(/type delete to confirm/i).fill("delete");

    await expect(deleteButton).toBeDisabled();

    await deleteCard.getByLabel(/type delete to confirm/i).fill("DELETE");

    await expect(deleteButton).toBeEnabled();
  });


  test("project creation dialog traps focus and returns it on close", async ({ page }) => {
    const createButton = page.getByRole("button", { name: "New project", exact: true });
    await createButton.focus();
    await createButton.click();
    const dialog = page.getByRole("dialog", { name: /create a new project/i });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel(/project title/i)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(createButton).toBeFocused();
  });

  test("creates and removes a disposable project through the real API", async ({ page }) => {
    test.skip(!allowMutations, "Set E2E_ALLOW_MUTATIONS=true only for a disposable development database.");
    const title = `E2E verification ${Date.now()}`;
    const created = await page.request.post(`${apiUrl}/api/projects`, {
      data: { title, description: "Created by the automated FinalFrame verification suite." },
    });
    expect(created.ok()).toBeTruthy();
    const project = await created.json() as { id: string; version: number };

    const deleted = await page.request.delete(`${apiUrl}/api/projects/${project.id}`, {
      data: { expectedVersion: project.version },
    });
    expect(deleted.ok()).toBeTruthy();
  });

  test("processes a real browser upload through Client approval and signed evidence", async ({ page, browser, browserName }) => {
    test.skip(browserName !== "chromium", "The full storage and processing workflow runs once in Chromium; workspace behavior remains cross-browser tested.");
    test.skip(!allowMutations, "The complete review workflow requires a disposable database and object store.");
    test.skip(!clientEmail || !clientPassword, "Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD.");
    test.setTimeout(240_000);
    const title = `Secure review workflow ${Date.now()}`;
    const created = await page.request.post(`${apiUrl}/api/projects`, {
      data: { title, description: "Full upload, scan, preview, approval, and evidence verification." },
    });
    expect(created.ok()).toBeTruthy();
    const project = await created.json() as { id: string; version: number };
    let cleanupVersion = project.version;

    const clientContext = await browser.newContext();
    try {
      const started = await page.request.post(`${apiUrl}/api/projects/${project.id}/assets/upload/start`, {
        data: {
          fileName: "final-review.png",
          fileType: "image/png",
          fileSize: reviewPng.byteLength,
          expectedVersion: project.version,
        },
      });
      expect(started.ok()).toBeTruthy();
      const reservation = await started.json() as {
        uploadUrl: string;
        uploadHeaders: Record<string, string>;
        storageKey: string;
        fileName: string;
        fileType: string;
        fileSize: number;
      };

      const browserUpload = await page.evaluate(async ({ uploadUrl, uploadHeaders, bytes }) => {
        const response = await fetch(uploadUrl, {
          method: "PUT",
          headers: uploadHeaders,
          body: Uint8Array.from(bytes),
        });
        return { ok: response.ok, status: response.status };
      }, {
        uploadUrl: reservation.uploadUrl,
        uploadHeaders: reservation.uploadHeaders,
        bytes: [...reviewPng],
      });
      expect(browserUpload, `Presigned browser upload returned HTTP ${browserUpload.status}`).toMatchObject({ ok: true });

      const completed = await page.request.post(`${apiUrl}/api/projects/${project.id}/assets/upload/complete`, {
        data: {
          storageKey: reservation.storageKey,
          originalFileName: reservation.fileName,
          fileType: reservation.fileType,
          fileSize: reservation.fileSize,
          expectedVersion: project.version,
        },
      });
      expect(completed.ok()).toBeTruthy();
      const uploaded = await completed.json() as { id: string; projectVersion: number };
      cleanupVersion = uploaded.projectVersion;
      await waitForCleanAsset(page, project.id, uploaded.id);

      const finalSelection = await page.request.patch(`${apiUrl}/api/projects/${project.id}/final-asset`, {
        data: { assetId: uploaded.id, expectedVersion: cleanupVersion },
      });
      expect(finalSelection.ok()).toBeTruthy();
      cleanupVersion = (await finalSelection.json() as { version: number }).version;

      const invited = await page.request.post(`${apiUrl}/api/projects/${project.id}/invitations`, {
        data: { email: clientEmail, canApprove: true, expectedVersion: cleanupVersion },
      });
      expect(invited.ok()).toBeTruthy();
      const invitation = await invited.json() as { inviteUrl: string; projectVersion: number };
      cleanupVersion = invitation.projectVersion;

      const clientPage = await clientContext.newPage();
      await login(clientPage, clientEmail || "", clientPassword || "");
      await clientPage.goto(invitation.inviteUrl);
      await expect(clientPage).toHaveURL(new RegExp(`/project/${project.id}$`));

      const joinedWorkspace = await page.request.get(`${apiUrl}/api/projects/workspace/${project.id}`);
      expect(joinedWorkspace.ok()).toBeTruthy();
      cleanupVersion = (await joinedWorkspace.json() as { version: number }).version;

      const submitted = await page.request.post(`${apiUrl}/api/projects/${project.id}/review`, {
        data: { status: "IN_REVIEW", expectedVersion: cleanupVersion },
      });
      expect(submitted.ok()).toBeTruthy();
      const submittedProject = await submitted.json() as { version: number; status: string };
      expect(submittedProject.status).toBe("IN_REVIEW");
      cleanupVersion = submittedProject.version;

      const approved = await clientPage.request.post(`${apiUrl}/api/projects/${project.id}/review`, {
        data: { status: "APPROVED", expectedVersion: cleanupVersion },
      });
      expect(approved.ok()).toBeTruthy();
      const approvedProject = await approved.json() as { version: number; status: string };
      expect(approvedProject.status).toBe("APPROVED");
      cleanupVersion = approvedProject.version;

      const lockedOriginal = await clientPage.request.get(`${apiUrl}/api/projects/${project.id}/assets/${uploaded.id}/download`);
      expect(lockedOriginal.status()).toBe(423);

      const previewResponse = await clientPage.request.get(`${apiUrl}/api/projects/${project.id}/assets/${uploaded.id}/preview`);
      expect(previewResponse.ok()).toBeTruthy();
      const preview = await previewResponse.json() as { url: string; mimeType: string };
      expect(preview.mimeType).toBe("image/webp");
      const previewUrl = /^https?:\/\//iu.test(preview.url)
        ? preview.url
        : `${apiUrl}${preview.url}`;
      const previewFetch = await clientPage.evaluate(async (url) => {
        const response = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });
        return {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type"),
          bytes: (await response.arrayBuffer()).byteLength,
        };
      }, previewUrl);
      expect(previewFetch.ok).toBeTruthy();
      expect(previewFetch.contentType).toContain("image/webp");
      expect(previewFetch.bytes).toBeGreaterThan(0);

      const approvedWorkspace = await clientPage.request.get(`${apiUrl}/api/projects/workspace/${project.id}`);
      expect(approvedWorkspace.ok()).toBeTruthy();
      const evidence = await approvedWorkspace.json() as {
        latestSignedApproval: { id: string; certificateDigest: string | null; certificateSignature: string | null } | null;
      };
      expect(evidence.latestSignedApproval?.certificateDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(evidence.latestSignedApproval?.certificateSignature).toBeTruthy();

      const certificate = await clientPage.request.get(
        `${apiUrl}/api/projects/${project.id}/approval-events/${evidence.latestSignedApproval?.id}/certificate`,
      );
      expect(certificate.ok()).toBeTruthy();
      expect(await certificate.json()).toMatchObject({ schema: "finalframe.approval-certificate.v1" });

      const audit = await page.request.get(`${apiUrl}/api/projects/${project.id}/audit-export`);
      expect(audit.ok()).toBeTruthy();
      expect(audit.headers()["content-type"]).toContain("application/x-ndjson");
      const auditRecords = (await audit.text())
        .trim()
        .split(/\r?\n/u)
        .map((line) => JSON.parse(line) as {
          type: string;
          data?: {
            schema?: string;
            algorithm?: string;
            digest?: string;
            signature?: string;
          };
        });

      const auditSignature = auditRecords.find(
        (record) => record.type === "signature",
      );

      expect(auditSignature?.data).toMatchObject({
        schema: "finalframe.project-audit-manifest.v1",
        algorithm: "Ed25519",
      });
      expect(auditSignature?.data?.digest).toMatch(/^[a-f0-9]{64}$/u);
      expect(auditSignature?.data?.signature).toMatch(/^[A-Za-z0-9_-]+$/u);
    } finally {
      await clientContext.close();
      const workspace = await page.request.get(`${apiUrl}/api/projects/workspace/${project.id}`);
      if (workspace.ok()) cleanupVersion = (await workspace.json() as { version: number }).version;
      await page.request.delete(`${apiUrl}/api/projects/${project.id}`, {
        data: { expectedVersion: cleanupVersion },
      });
    }
  });

  test("accepts a one-time Client invitation and updates members without a refresh", async ({ page, browser }) => {
    test.skip(!allowMutations, "Invitation integration requires a disposable database.");
    test.skip(!clientEmail || !clientPassword, "Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD.");
    test.setTimeout(240_000);
    const title = `Realtime invitation ${Date.now()}`;
    const created = await page.request.post(`${apiUrl}/api/projects`, {
      data: { title, description: "Invitation and realtime membership verification." },
    });
    expect(created.ok()).toBeTruthy();
    const project = await created.json() as { id: string; version: number };

    await page.goto(`/project/${project.id}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const invited = await page.request.post(`${apiUrl}/api/projects/${project.id}/invitations`, {
      data: {
        email: clientEmail,
        canApprove: true,
        expectedVersion: project.version,
      },
    });
    expect(invited.ok()).toBeTruthy();
    const invitation = await invited.json() as { inviteUrl: string; projectVersion: number };

    const clientContext = await browser.newContext();
    try {
      const clientPage = await clientContext.newPage();
      await login(clientPage, clientEmail || "", clientPassword || "");
      await clientPage.goto(invitation.inviteUrl);
      await expect(clientPage).toHaveURL(new RegExp(`/project/${project.id}$`));
      await expect(clientPage.getByRole("heading", { name: title })).toBeVisible();

      await page.getByRole("button", { name: /^review$/i }).click();
      const memberControl = page.getByRole("button", { name: /members · 1/i });
      await expect(memberControl).toBeVisible({ timeout: 15_000 });
      await memberControl.click();
      await expect(page.getByText("FinalFrame E2E Client", { exact: true })).toBeVisible();

      const workspaceResponse = await page.request.get(`${apiUrl}/api/projects/workspace/${project.id}`);
      expect(workspaceResponse.ok()).toBeTruthy();
      const currentWorkspace = await workspaceResponse.json() as {
        version: number;
        members: Array<{ userId: string; user: { email: string } }>;
      };
      const joinedClient = currentWorkspace.members.find((member) => member.user.email === clientEmail);
      expect(joinedClient).toBeTruthy();

      const removed = await page.request.delete(
        `${apiUrl}/api/projects/${project.id}/members/${joinedClient?.userId}`,
        { data: { expectedVersion: currentWorkspace.version } },
      );
      expect(removed.ok()).toBeTruthy();
      await expect(clientPage.getByRole("heading", { name: /project access removed/i })).toBeVisible({ timeout: 15_000 });

      const replayed = await clientPage.request.get(`${apiUrl}/api/projects/workspace/${project.id}`);
      expect(replayed.status()).toBe(404);
    } finally {
      await clientContext.close();
      const workspace = await page.request.get(`${apiUrl}/api/projects/workspace/${project.id}`);
      if (workspace.ok()) {
        const latest = await workspace.json() as { version: number };
        await page.request.delete(`${apiUrl}/api/projects/${project.id}`, {
          data: { expectedVersion: latest.version },
        });
      }
    }
  });
});
