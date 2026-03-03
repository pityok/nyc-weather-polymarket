import { normalizeDistribution, type Distribution, type RangeKey } from "../types/ranges.js";

export type PolymarketOutcome = { label: string; probability: number };

export type PolymarketBinaryQuestionMarket = {
  question: string;
  outcomes: string[];
  outcomePrices: number[];
};

type NumericRange = {
  min: number | null;
  max: number | null;
};

const labelToRange: Record<string, RangeKey> = {
  "<=33": "le_33",
  "35°f or below": "le_33",
  "35f or below": "le_33",
  "34-35": "r_34_35",
  "36-37": "r_36_37",
  "38-39": "r_38_39",
  "40-41": "r_40_41",
  "42-43": "r_42_43",
  "44-45": "r_44_45",
  "46-47": "r_46_47",
  "48-49": "r_48_49",
  "48-49°f": "r_48_49",
  "50-51": "r_50_51",
  "50-51°f": "r_50_51",
  "52-53": "r_52_53",
  "52-53°f": "r_52_53",
  "54+": "ge_54",
  "54°f or higher": "ge_54",
  "50°f or higher": "ge_54",
  ">=54": "ge_54",
};

const MODEL_BIN_RANGES: Array<{ key: RangeKey; range: NumericRange }> = [
  { key: "le_33", range: { min: null, max: 33 } },
  { key: "r_34_35", range: { min: 34, max: 35 } },
  { key: "r_36_37", range: { min: 36, max: 37 } },
  { key: "r_38_39", range: { min: 38, max: 39 } },
  { key: "r_40_41", range: { min: 40, max: 41 } },
  { key: "r_42_43", range: { min: 42, max: 43 } },
  { key: "r_44_45", range: { min: 44, max: 45 } },
  { key: "r_46_47", range: { min: 46, max: 47 } },
  { key: "r_48_49", range: { min: 48, max: 49 } },
  { key: "r_50_51", range: { min: 50, max: 51 } },
  { key: "r_52_53", range: { min: 52, max: 53 } },
  { key: "ge_54", range: { min: 54, max: null } },
];

function toF(value: number, unit: "f" | "c"): number {
  if (unit === "f") return value;
  return (value * 9) / 5 + 32;
}

function parseQuestionRangeInF(question: string): NumericRange | null {
  const q = question.toLowerCase().replace(/º/g, "°");

  const below = q.match(/be\s+(-?\d+(?:\.\d+)?)\s*°?\s*([fc])\s*or below/);
  if (below) {
    const value = toF(Number(below[1]), below[2] as "f" | "c");
    return { min: null, max: value };
  }

  const between = q.match(/be\s+between\s+(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*°?\s*([fc])/);
  if (between) {
    const a = toF(Number(between[1]), between[3] as "f" | "c");
    const b = toF(Number(between[2]), between[3] as "f" | "c");
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  const higher = q.match(/be\s+(-?\d+(?:\.\d+)?)\s*°?\s*([fc])\s*or higher/);
  if (higher) {
    const value = toF(Number(higher[1]), higher[2] as "f" | "c");
    return { min: value, max: null };
  }

  // e.g. "be 13°C on March 4"
  const exact = q.match(/be\s+(-?\d+(?:\.\d+)?)\s*°?\s*([fc])\s+on/);
  if (exact) {
    const value = toF(Number(exact[1]), exact[2] as "f" | "c");
    return { min: value, max: value };
  }

  return null;
}

function rangesIntersect(a: NumericRange, b: NumericRange): boolean {
  const aMin = a.min ?? Number.NEGATIVE_INFINITY;
  const aMax = a.max ?? Number.POSITIVE_INFINITY;
  const bMin = b.min ?? Number.NEGATIVE_INFINITY;
  const bMax = b.max ?? Number.POSITIVE_INFINITY;
  return aMax >= bMin && bMax >= aMin;
}

function binsForRange(range: NumericRange): RangeKey[] {
  return MODEL_BIN_RANGES.filter((b) => rangesIntersect(range, b.range)).map((b) => b.key);
}

function toPercent(prob: number): number {
  return prob <= 1 ? prob * 100 : prob;
}

function yesProbability(outcomes: string[], outcomePrices: number[]): number | null {
  const labels = outcomes.map((x) => x.trim().toLowerCase());
  const yesIdx = labels.indexOf("yes");
  if (yesIdx < 0) return null;
  const raw = outcomePrices[yesIdx];
  if (!Number.isFinite(raw)) return null;
  return toPercent(raw);
}

export function mapPolymarketToRanges(outcomes: PolymarketOutcome[]): Distribution {
  const dist: Partial<Record<RangeKey, number>> = {};
  for (const o of outcomes) {
    const key = labelToRange[o.label.trim().toLowerCase()];
    if (!key) continue;
    dist[key] = (dist[key] ?? 0) + o.probability;
  }
  return normalizeDistribution(dist);
}

/**
 * Maps binary Polymarket weather questions (Yes/No per temperature bucket)
 * to the internal 12-bin F distribution.
 */
export function mapPolymarketBinaryMarketsToRanges(
  markets: PolymarketBinaryQuestionMarket[],
): Distribution | null {
  const dist: Partial<Record<RangeKey, number>> = {};

  for (const m of markets) {
    const pYes = yesProbability(m.outcomes, m.outcomePrices);
    if (pYes == null) continue;

    const range = parseQuestionRangeInF(m.question);
    if (!range) continue;

    const keys = binsForRange(range);
    if (!keys.length) continue;

    const share = pYes / keys.length;
    for (const key of keys) {
      dist[key] = (dist[key] ?? 0) + share;
    }
  }

  const sum = Object.values(dist).reduce((a, b) => a + (b ?? 0), 0);
  if (sum <= 0) return null;

  return normalizeDistribution(dist);
}
