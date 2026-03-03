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
    expect(getMarketEntry("2026-03-05", "nyc")).toBeNull();
  });

  it("returns city-specific entry from env when date:city matches", () => {
    vi.stubEnv(
      "POLYMARKET_MARKET_IDS",
      JSON.stringify({ "2026-03-05:nyc": { conditionId: "0xabc123" } }),
    );
    const entry = getMarketEntry("2026-03-05", "nyc");
    expect(entry).toEqual({ conditionId: "0xabc123" });
  });

  it("falls back to legacy date-only entry when city-specific key is absent", () => {
    vi.stubEnv(
      "POLYMARKET_MARKET_IDS",
      JSON.stringify({ "2026-03-05": { conditionId: "0xlegacy" } }),
    );
    const entry = getMarketEntry("2026-03-05", "london");
    expect(entry).toEqual({ conditionId: "0xlegacy" });
  });

  it("supports shorthand string value for conditionId", () => {
    vi.stubEnv("POLYMARKET_MARKET_IDS", JSON.stringify({ "2026-03-05:nyc": "0xabc123" }));
    const entry = getMarketEntry("2026-03-05", "nyc");
    expect(entry).toEqual({ conditionId: "0xabc123" });
  });

  it("supports shorthand string value for slug", () => {
    vi.stubEnv(
      "POLYMARKET_MARKET_IDS",
      JSON.stringify({ "2026-03-07:nyc": "highest-temperature-in-nyc-on-march-7-2026" }),
    );
    const entry = getMarketEntry("2026-03-07", "nyc");
    expect(entry).toEqual({ slug: "highest-temperature-in-nyc-on-march-7-2026" });
  });

  it("returns null for date not in env registry", () => {
    vi.stubEnv(
      "POLYMARKET_MARKET_IDS",
      JSON.stringify({ "2026-03-05:nyc": { conditionId: "0xabc123" } }),
    );
    expect(getMarketEntry("2026-03-06", "nyc")).toBeNull();
  });

  it("handles invalid JSON in env gracefully", () => {
    vi.stubEnv("POLYMARKET_MARKET_IDS", "{bad json");
    expect(getMarketEntry("2026-03-05", "nyc")).toBeNull();
  });

  it("supports object slug entries", () => {
    vi.stubEnv(
      "POLYMARKET_MARKET_IDS",
      JSON.stringify({ "2026-03-07:nyc": { slug: "highest-temperature-nyc-march-7" } }),
    );
    const entry = getMarketEntry("2026-03-07", "nyc");
    expect(entry?.slug).toBe("highest-temperature-nyc-march-7");
  });
});
