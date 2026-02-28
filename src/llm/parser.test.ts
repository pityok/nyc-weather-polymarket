import { describe, expect, it } from "vitest";
import { parseModelDistribution } from "./parser.js";

describe("LLM parser", () => {
  it("extracts JSON from text", () => {
    const raw = 'hello {"probs":{"le_33":5,"r_34_35":5,"r_36_37":8,"r_38_39":10,"r_40_41":12,"r_42_43":12,"r_44_45":12,"r_46_47":12,"r_48_49":10,"r_50_51":7,"r_52_53":4,"ge_54":3},"confidence":"high","reasoningSummary":"ok"} bye';
    const parsed = parseModelDistribution(raw);
    expect(parsed.confidence).toBe("high");
    expect(parsed.sumBeforeNormalization).toBe(100);
  });
});
