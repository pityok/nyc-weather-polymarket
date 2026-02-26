import { describe, expect, it } from "vitest";
import { computeEdgeRecommendation } from "./edge.service.js";

describe("edge logic", () => {
  it("returns bet above thresholds", () => {
    const r = computeEdgeRecommendation(30, 10);
    expect(r.recommendation).toBe("bet");
  });

  it("returns no_bet below thresholds", () => {
    const r = computeEdgeRecommendation(11, 10);
    expect(r.recommendation).toBe("no_bet");
  });
});
