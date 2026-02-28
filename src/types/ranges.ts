import { z } from "zod";

export const RANGES = [
  "le_33",
  "r_34_35",
  "r_36_37",
  "r_38_39",
  "r_40_41",
  "r_42_43",
  "r_44_45",
  "r_46_47",
  "r_48_49",
  "r_50_51",
  "r_52_53",
  "ge_54",
] as const;

export type RangeKey = (typeof RANGES)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  le_33: "<=33°F",
  r_34_35: "34-35°F",
  r_36_37: "36-37°F",
  r_38_39: "38-39°F",
  r_40_41: "40-41°F",
  r_42_43: "42-43°F",
  r_44_45: "44-45°F",
  r_46_47: "46-47°F",
  r_48_49: "48-49°F",
  r_50_51: "50-51°F",
  r_52_53: "52-53°F",
  ge_54: ">=54°F",
};

export const distributionSchema = z.object(
  Object.fromEntries(RANGES.map((k) => [k, z.number().min(0).max(100)])) as Record<RangeKey, z.ZodNumber>,
);

export type Distribution = z.infer<typeof distributionSchema>;

export function normalizeDistribution(dist: Partial<Record<RangeKey, number>>): Distribution {
  const base = Object.fromEntries(RANGES.map((k) => [k, Math.max(0, Number(dist[k] ?? 0))])) as Distribution;
  const sum = Object.values(base).reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("Distribution is empty");

  const normalized = Object.fromEntries(
    RANGES.map((k) => [k, Number(((base[k] / sum) * 100).toFixed(4))]),
  ) as Distribution;

  const nsum = Object.values(normalized).reduce((a, b) => a + b, 0);
  normalized.ge_54 = Number((normalized.ge_54 + (100 - nsum)).toFixed(4));
  return normalized;
}

export function validateDistribution(dist: Partial<Record<RangeKey, number>>): Distribution {
  const normalized = normalizeDistribution(dist);
  return distributionSchema.parse(normalized);
}

export function topRange(dist: Partial<Record<RangeKey, number>>) {
  const v = validateDistribution(dist);
  return RANGES.reduce(
    (best, key) => (v[key] > best.value ? { key, value: v[key] } : best),
    { key: RANGES[0], value: v[RANGES[0]] } as { key: RangeKey; value: number },
  );
}
