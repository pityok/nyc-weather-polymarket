import { describe, expect, it } from "vitest";
import { mapPolymarketToRanges } from "./mapper.js";

describe("Polymarket mapper", () => {
  it("maps to 9 ranges", () => {
    const d = mapPolymarketToRanges([
      { label: "<=33", probability: 50 },
      { label: ">=48", probability: 50 },
    ]);
    expect(Object.keys(d).length).toBe(9);
    expect(d.le_33).toBeGreaterThan(0);
  });
});
