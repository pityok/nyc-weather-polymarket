import { normalizeDistribution, type RangeKey } from "../types/ranges.js";

export type PolymarketOutcome = { label: string; probability: number };

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

export function mapPolymarketToRanges(outcomes: PolymarketOutcome[]) {
  const dist: Partial<Record<RangeKey, number>> = {};
  for (const o of outcomes) {
    const key = labelToRange[o.label.trim().toLowerCase()];
    if (!key) continue;
    dist[key] = (dist[key] ?? 0) + o.probability;
  }
  return normalizeDistribution(dist);
}
