import { describe, expect, it } from "vitest";
import { normalizeDistribution, topRange } from "./ranges.js";

describe("normalizeDistribution", () => {
  it("normalizes to 100", () => {
    const d = normalizeDistribution({ le_33: 1, ge_54: 1 });
    const sum = Object.values(d).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 4);
  });

  it("returns top range", () => {
    const t = topRange({ le_33: 1, ge_54: 99 });
    expect(t.key).toBe("ge_54");
  });
});
