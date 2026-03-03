import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./fetchWithRetry.js";
import type { FetchRetryConfig } from "./fetchWithRetry.js";

const fastConfig: FetchRetryConfig = {
  timeoutMs: 5_000,
  maxRetries: 2,
  baseDelayMs: 1,
  maxDelayMs: 10,
};

function makeResponse(status: number, body = "{}"): Response {
  return new Response(body, { status });
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns response immediately on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, '{"ok":true}'));

    const res = await fetchWithRetry("https://example.com/api", {}, fastConfig);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and succeeds on second attempt", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(500))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await fetchWithRetry("https://example.com/api", {}, fastConfig);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 (rate limit)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await fetchWithRetry("https://example.com/api", {}, fastConfig);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(404));

    await expect(fetchWithRetry("https://example.com/api", {}, fastConfig)).rejects.toThrow(
      "HTTP 404 (non-retryable)",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws after all retries exhausted", async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(503));

    await expect(fetchWithRetry("https://example.com/api", {}, fastConfig)).rejects.toThrow(
      "after 3 attempt(s)",
    );
    expect(fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("retries on network error", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await fetchWithRetry("https://example.com/api", {}, fastConfig);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
