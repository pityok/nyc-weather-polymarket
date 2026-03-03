import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMarketEntry, _resetRegistryCache } from "./registry.js";

describe("market registry", () => {
  beforeEach(() => {
    _resetRegistryCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetRegistryCache();
  });

  it("returns null when POLYMARKET_MARKET_IDS is not set", () => {
    vi.stubEnv("POLYMARKET_MARKET_IDS", "");
    expect(getMarketEntry("2026-03-05")).toBeNull();
  });

  it("returns entry from env when date matches", () => {
    vi.stubEnv(
      "POLYMARKET_MARKET_IDS",
      JSON.stringify({ "2026-03-05": { conditionId: "0xabc123" } }),
    );
    const entry = getMarketEntry("2026-03-05");
    expect(entry).toEqual({ conditionId: "0xabc123" });
  });

  it("returns null for date not in env registry", () => {
    vi.stubEnv(
      "POLYMARKET_MARKET_IDS",
      JSON.stringify({ "2026-03-05": { conditionId: "0xabc123" } }),
    );
    expect(getMarketEntry("2026-03-06")).toBeNull();
  });

  it("handles invalid JSON in env gracefully", () => {
    vi.stubEnv("POLYMARKET_MARKET_IDS", "{bad json");
    expect(getMarketEntry("2026-03-05")).toBeNull();
  });

  it("supports slug-based entries", () => {
    vi.stubEnv(
      "POLYMARKET_MARKET_IDS",
      JSON.stringify({ "2026-03-07": { slug: "highest-temperature-nyc-march-7" } }),
    );
    const entry = getMarketEntry("2026-03-07");
    expect(entry?.slug).toBe("highest-temperature-nyc-march-7");
  });
});
