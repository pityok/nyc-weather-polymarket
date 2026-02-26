import { describe, expect, it } from "vitest";
import { formatUtcMskTimestamps } from "./time.js";

describe("timezone conversion", () => {
  it("formats UTC and MSK", () => {
    const t = formatUtcMskTimestamps(new Date("2026-01-01T00:00:00.000Z"));
    expect(t.utc).toContain("2026-01-01T00:00:00.000Z");
    expect(t.msk).toContain("MSK");
  });
});
