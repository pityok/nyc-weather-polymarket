import { describe, expect, it } from "vitest";
import { mapPolymarketToRanges } from "./mapper.js";

describe("Polymarket mapper", () => {
  it("maps to 12 ranges", () => {
    const d = mapPolymarketToRanges([
      { label: "<=33", probability: 50 },
      { label: "54+", probability: 50 },
    ]);
    expect(Object.keys(d).length).toBe(12);
    expect(d.le_33).toBeGreaterThan(0);
    expect(d.ge_54).toBeGreaterThan(0);
  });
});
