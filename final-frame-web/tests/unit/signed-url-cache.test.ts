import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  requestSecureAssetUrl: vi.fn(),
  requestCommentAudioUrl: vi.fn(),
}));

vi.mock("@/lib/api/assets", () => ({
  requestSecureAssetUrl: api.requestSecureAssetUrl,
}));

vi.mock("@/lib/api/comments", () => ({
  requestCommentAudioUrl: api.requestCommentAudioUrl,
}));

import {
  clearSignedUrlCaches,
  getCachedAssetUrl,
  getCachedCommentAudioUrl,
  invalidateAssetUrl,
  invalidateCommentAudioUrl,
  peekCachedAssetUrl,
  prefetchAssetUrl,
} from "@/lib/storage/signed-url-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("signed URL request sharing", () => {
  beforeEach(() => {
    clearSignedUrlCaches();
    api.requestSecureAssetUrl.mockReset();
    api.requestCommentAudioUrl.mockReset();
  });

  it("does not let one viewer abort a shared asset URL request", async () => {
    const pending = deferred<{ url: string; expiresInSeconds: number }>();
    api.requestSecureAssetUrl.mockReturnValueOnce(pending.promise);
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = getCachedAssetUrl("asset-1", "preview", { signal: firstController.signal });
    const second = getCachedAssetUrl("asset-1", "preview", { signal: secondController.signal });
    firstController.abort();
    pending.resolve({ url: "https://storage.example/preview", expiresInSeconds: 300 });

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).resolves.toBe("https://storage.example/preview");
    expect(api.requestSecureAssetUrl).toHaveBeenCalledTimes(1);
    expect(api.requestSecureAssetUrl).toHaveBeenCalledWith("asset-1", "preview");
  });

  it("does not let one comment player abort a shared audio URL request", async () => {
    const pending = deferred<{ url: string; expiresInSeconds: number }>();
    api.requestCommentAudioUrl.mockReturnValueOnce(pending.promise);
    const firstController = new AbortController();

    const first = getCachedCommentAudioUrl("project-1", "asset-1", "comment-1", {
      signal: firstController.signal,
    });
    const second = getCachedCommentAudioUrl("project-1", "asset-1", "comment-1");
    firstController.abort();
    pending.resolve({ url: "https://storage.example/audio", expiresInSeconds: 300 });

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).resolves.toBe("https://storage.example/audio");
    expect(api.requestCommentAudioUrl).toHaveBeenCalledTimes(1);
    expect(api.requestCommentAudioUrl).toHaveBeenCalledWith("project-1", "asset-1", "comment-1");
  });
  it("reuses valid cached URLs and supports explicit invalidation", async () => {
    api.requestSecureAssetUrl
      .mockResolvedValueOnce({ url: "https://storage.example/one", expiresInSeconds: 300 })
      .mockResolvedValueOnce({ url: "https://storage.example/two", expiresInSeconds: 300 });

    await expect(getCachedAssetUrl("asset-2")).resolves.toBe("https://storage.example/one");
    expect(peekCachedAssetUrl("asset-2")).toBe("https://storage.example/one");
    await expect(getCachedAssetUrl("asset-2")).resolves.toBe("https://storage.example/one");
    expect(api.requestSecureAssetUrl).toHaveBeenCalledTimes(1);

    invalidateAssetUrl("asset-2", "preview");
    expect(peekCachedAssetUrl("asset-2")).toBe("");
    await expect(getCachedAssetUrl("asset-2")).resolves.toBe("https://storage.example/two");
    expect(api.requestSecureAssetUrl).toHaveBeenCalledTimes(2);
  });

  it("prefetches once and clears audio entries independently", async () => {
    api.requestSecureAssetUrl.mockResolvedValue({ url: "https://storage.example/prefetched", expiresInSeconds: 300 });
    api.requestCommentAudioUrl.mockResolvedValue({ url: "https://storage.example/audio", expiresInSeconds: 300 });

    prefetchAssetUrl("asset-prefetch");
    await vi.waitFor(() => expect(peekCachedAssetUrl("asset-prefetch")).toContain("prefetched"));
    prefetchAssetUrl("asset-prefetch");
    expect(api.requestSecureAssetUrl).toHaveBeenCalledTimes(1);

    await getCachedCommentAudioUrl("project-2", "asset-2", "comment-2");
    invalidateCommentAudioUrl("project-2", "asset-2", "comment-2");
    await getCachedCommentAudioUrl("project-2", "asset-2", "comment-2");
    expect(api.requestCommentAudioUrl).toHaveBeenCalledTimes(2);
  });

  it("does not repopulate a URL after access invalidation", async () => {
    const pending = deferred<{ url: string; expiresInSeconds: number }>();
    api.requestSecureAssetUrl.mockReturnValueOnce(pending.promise);

    const request = getCachedAssetUrl("revoked-asset");
    invalidateAssetUrl("revoked-asset");
    pending.resolve({ url: "https://storage.example/revoked", expiresInSeconds: 300 });

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(peekCachedAssetUrl("revoked-asset")).toBe("");
  });

  it("does not repopulate URLs after all caches are cleared", async () => {
    const pending = deferred<{ url: string; expiresInSeconds: number }>();
    api.requestSecureAssetUrl.mockReturnValueOnce(pending.promise);

    const request = getCachedAssetUrl("logout-asset");
    clearSignedUrlCaches();
    pending.resolve({ url: "https://storage.example/logout", expiresInSeconds: 300 });

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(peekCachedAssetUrl("logout-asset")).toBe("");
  });

});
