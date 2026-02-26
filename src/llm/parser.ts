import { normalizeDistribution, type RangeKey } from "../types/ranges.js";

export function extractJsonObject(text: string): unknown {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) throw new Error("No JSON object found");
  return JSON.parse(text.slice(first, last + 1));
}

export function parseModelDistribution(rawText: string): {
  probs: Record<RangeKey, number>;
  confidence: "low" | "medium" | "high";
  reasoningSummary: string;
  sumBeforeNormalization: number;
} {
  const parsed = extractJsonObject(rawText) as {
    probs?: Record<RangeKey, number>;
    confidence?: "low" | "medium" | "high";
    reasoningSummary?: string;
  };

  const input = parsed.probs ?? ({} as Record<RangeKey, number>);
  const sumBeforeNormalization = Object.values(input).reduce((a, b) => a + Number(b || 0), 0);
  const probs = normalizeDistribution(input);

  return {
    probs,
    confidence: parsed.confidence ?? "medium",
    reasoningSummary: parsed.reasoningSummary ?? "No reasoning provided",
    sumBeforeNormalization,
  };
}
