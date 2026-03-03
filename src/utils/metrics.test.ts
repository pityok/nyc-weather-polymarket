import { afterEach, describe, expect, it } from "vitest";
import { recordCall, getMetrics, resetMetrics } from "./metrics.js";

afterEach(() => {
  resetMetrics();
});

describe("metrics", () => {
  it("starts empty", () => {
    expect(getMetrics()).toEqual({});
  });

  it("records a successful call", () => {
    recordCall("open-meteo", 250, 0);
    const m = getMetrics()["open-meteo"];
    expect(m.callCount).toBe(1);
    expect(m.errorCount).toBe(0);
    expect(m.retryCount).toBe(0);
    expect(m.avgLatencyMs).toBe(250);
    expect(m.errorRate).toBe(0);
  });

  it("records retries and errors", () => {
    recordCall("polymarket", 5000, 2, "HTTP 503 (after 3 attempts)");
    const m = getMetrics()["polymarket"];
    expect(m.callCount).toBe(1);
    expect(m.errorCount).toBe(1);
    expect(m.retryCount).toBe(2);
    expect(m.errorRate).toBe(1);
    expect(m.lastErrorMessage).toContain("HTTP 503");
    expect(m.lastErrorAt).not.toBeNull();
  });

  it("accumulates multiple calls", () => {
    recordCall("openrouter", 1000, 0);
    recordCall("openrouter", 3000, 1);
    recordCall("openrouter", 500, 0, "timeout");
    const m = getMetrics()["openrouter"];
    expect(m.callCount).toBe(3);
    expect(m.errorCount).toBe(1);
    expect(m.retryCount).toBe(1);
    expect(m.avgLatencyMs).toBeCloseTo(1500, 0);
    expect(m.errorRate).toBeCloseTo(0.3333, 3);
  });

  it("tracks multiple services independently", () => {
    recordCall("open-meteo", 200, 0);
    recordCall("polymarket", 800, 1, "timeout");
    const all = getMetrics();
    expect(all["open-meteo"].errorCount).toBe(0);
    expect(all["polymarket"].errorCount).toBe(1);
  });

  it("resetMetrics clears all data", () => {
    recordCall("open-meteo", 100, 0);
    resetMetrics();
    expect(getMetrics()).toEqual({});
  });
});
