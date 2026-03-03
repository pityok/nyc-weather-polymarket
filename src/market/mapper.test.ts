import { describe, expect, it } from "vitest";
import { mapPolymarketBinaryMarketsToRanges, mapPolymarketToRanges } from "./mapper.js";

describe("Polymarket mapper", () => {
  it("maps label-based outcomes to 12 ranges", () => {
    const d = mapPolymarketToRanges([
      { label: "<=33", probability: 50 },
      { label: "54+", probability: 50 },
    ]);
    expect(Object.keys(d).length).toBe(12);
    expect(d.le_33).toBeGreaterThan(0);
    expect(d.ge_54).toBeGreaterThan(0);
  });

  it("maps binary F weather questions (including 48+ tail)", () => {
    const d = mapPolymarketBinaryMarketsToRanges([
      {
        question: "Will the highest temperature in New York City be between 46-47°F on March 4?",
        outcomes: ["Yes", "No"],
        outcomePrices: [0.25, 0.75],
      },
      {
        question: "Will the highest temperature in New York City be 48°F or higher on March 4?",
        outcomes: ["Yes", "No"],
        outcomePrices: [0.6, 0.4],
      },
    ]);

    expect(d).not.toBeNull();
    expect(d?.r_46_47).toBeGreaterThan(0);
    expect(d?.r_48_49).toBeGreaterThan(0);
    expect(d?.r_50_51).toBeGreaterThan(0);
    expect(d?.r_52_53).toBeGreaterThan(0);
    expect(d?.ge_54).toBeGreaterThan(0);
  });

  it("maps binary C weather questions via conversion to F", () => {
    const d = mapPolymarketBinaryMarketsToRanges([
      {
        question: "Will the highest temperature in London be 12°C or below on March 4?",
        outcomes: ["Yes", "No"],
        outcomePrices: [0.4, 0.6],
      },
      {
        question: "Will the highest temperature in London be 20°C or higher on March 4?",
        outcomes: ["Yes", "No"],
        outcomePrices: [0.2, 0.8],
      },
    ]);

    expect(d).not.toBeNull();
    expect(d?.le_33).toBeGreaterThan(0);
    expect(d?.ge_54).toBeGreaterThan(0);
  });
});
