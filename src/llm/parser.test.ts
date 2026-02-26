import { describe, expect, it } from "vitest";
import { parseModelDistribution } from "./parser.js";

describe("LLM parser", () => {
  it("extracts JSON from text", () => {
    const raw = 'hello {"probs":{"le_33":10,"r_34_35":10,"r_36_37":10,"r_38_39":10,"r_40_41":10,"r_42_43":10,"r_44_45":10,"r_46_47":10,"ge_48":20},"confidence":"high","reasoningSummary":"ok"} bye';
    const parsed = parseModelDistribution(raw);
    expect(parsed.confidence).toBe("high");
    expect(parsed.sumBeforeNormalization).toBe(100);
  });
});
