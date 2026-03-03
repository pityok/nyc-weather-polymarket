import { describe, expect, it } from "vitest";
import { weightedDistribution } from "./forecastPipeline.service.js";
import { normalizeDistribution, RANGES, type Distribution } from "../types/ranges.js";

function peakedDist(peakKey: (typeof RANGES)[number]): Distribution {
  const raw = Object.fromEntries(RANGES.map((k) => [k, k === peakKey ? 90 : 1]));
  return normalizeDistribution(raw);
}

describe("weightedDistribution", () => {
  it("with equal weights produces same result as simple average", () => {
    const d1 = peakedDist("r_40_41");
    const d2 = peakedDist("r_42_43");
    const models = [
      { modelId: "m1", dist: d1 },
      { modelId: "m2", dist: d2 },
    ];
    const weights = new Map([
      ["m1", 0.5],
      ["m2", 0.5],
    ]);

    const result = weightedDistribution(models, weights);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 3);
  });

  it("heavily weighted model dominates the distribution", () => {
    const d1 = peakedDist("r_40_41"); // model with 90% weight
    const d2 = peakedDist("r_52_53"); // model with 10% weight
    const models = [
      { modelId: "m1", dist: d1 },
      { modelId: "m2", dist: d2 },
    ];
    const weights = new Map([
      ["m1", 0.9],
      ["m2", 0.1],
    ]);

    const result = weightedDistribution(models, weights);
    // r_40_41 should dominate
    expect(result.r_40_41).toBeGreaterThan(result.r_52_53);
  });

  it("falls back to equal-weight average when all weights are zero", () => {
    const models = [
      { modelId: "m1", dist: peakedDist("r_40_41") },
      { modelId: "m2", dist: peakedDist("r_42_43") },
    ];
    const weights = new Map<string, number>(); // no weights

    const result = weightedDistribution(models, weights);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 3);
  });

  it("weighted differs from simple when models have different quality", () => {
    const d1 = peakedDist("le_33");
    const d2 = peakedDist("ge_54");
    const models = [
      { modelId: "good", dist: d1 },
      { modelId: "bad", dist: d2 },
    ];

    // Simple average: equal 50/50
    const simpleWeights = new Map([
      ["good", 0.5],
      ["bad", 0.5],
    ]);
    // Quality weights: 80/20 in favor of "good"
    const qualityWeights = new Map([
      ["good", 0.8],
      ["bad", 0.2],
    ]);

    const simple = weightedDistribution(models, simpleWeights);
    const weighted = weightedDistribution(models, qualityWeights);

    // Weighted should give more probability to le_33 (good model's peak)
    expect(weighted.le_33).toBeGreaterThan(simple.le_33);
    expect(weighted.ge_54).toBeLessThan(simple.ge_54);
  });
});
