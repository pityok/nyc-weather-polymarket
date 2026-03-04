import { getMarketEntry } from "../market/registry.js";
import { fetchWithRetry, RETRY_POLYMARKET } from "../utils/fetchWithRetry.js";

type NativeBin = {
  key: string;
  label: string;
  order: number;
  yesProb: number;
  noProb: number;
  question: string;
  unit: "F" | "C";
  minF: number | null;
  maxF: number | null;
};

export type PolymarketNativeResult = {
  status: "healthy" | "degraded" | "failed";
  reason: string;
  source: string;
  eventId: string | null;
  bins: Array<Omit<NativeBin, "order">>;
  updatedAtUtc: string;
};

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseOutcomeLabels(value: unknown): string[] {
  return asArray(value).map((v) => String(v));
}

function parseOutcomePrices(value: unknown): number[] {
  return asArray(value).map((v) => Number(v)).filter((n) => Number.isFinite(n));
}

function toF(value: number, unit: "f" | "c"): number {
  if (unit === "f") return value;
  return (value * 9) / 5 + 32;
}

function parseQuestionToBin(question: string): { key: string; label: string; order: number; unit: "F" | "C"; minF: number | null; maxF: number | null } | null {
  const q = question.toLowerCase().replace(/º/g, "°");

  const below = q.match(/be\s+(-?\d+(?:\.\d+)?)\s*°?\s*([fc])\s*or below/);
  if (below) {
    const v = Number(below[1]);
    const unit = below[2].toUpperCase() as "F" | "C";
    const maxF = toF(v, below[2] as "f" | "c");
    return { key: `le_${v}_${unit.toLowerCase()}`, label: `≤${v}°${unit}`, order: Math.round(maxF) - 1, unit, minF: null, maxF };
  }

  const between = q.match(/between\s+(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*°?\s*([fc])/);
  if (between) {
    const aRaw = Number(between[1]);
    const bRaw = Number(between[2]);
    const unit = between[3].toUpperCase() as "F" | "C";
    const loRaw = Math.min(aRaw, bRaw);
    const hiRaw = Math.max(aRaw, bRaw);
    const aF = toF(aRaw, between[3] as "f" | "c");
    const bF = toF(bRaw, between[3] as "f" | "c");
    const loF = Math.min(aF, bF);
    const hiF = Math.max(aF, bF);
    return { key: `r_${loRaw}_${hiRaw}_${unit.toLowerCase()}`, label: `${loRaw}-${hiRaw}°${unit}`, order: Math.round(loF), unit, minF: loF, maxF: hiF };
  }

  const higher = q.match(/be\s+(-?\d+(?:\.\d+)?)\s*°?\s*([fc])\s*or higher/);
  if (higher) {
    const v = Number(higher[1]);
    const unit = higher[2].toUpperCase() as "F" | "C";
    const minF = toF(v, higher[2] as "f" | "c");
    return { key: `ge_${v}_${unit.toLowerCase()}`, label: `≥${v}°${unit}`, order: 10_000 + Math.round(minF), unit, minF, maxF: null };
  }

  const exact = q.match(/be\s+(-?\d+(?:\.\d+)?)\s*°?\s*([fc])\s+on/);
  if (exact) {
    const v = Number(exact[1]);
    const unit = exact[2].toUpperCase() as "F" | "C";
    const f = toF(v, exact[2] as "f" | "c");
    // exact bin: represent as ±0.5°F interval for overlap math
    return { key: `eq_${v}_${unit.toLowerCase()}`, label: `${v}°${unit}`, order: Math.round(f), unit, minF: f - 0.5, maxF: f + 0.5 };
  }

  return null;
}

function yesNoFromMarket(m: Record<string, unknown>): { yesProb: number; noProb: number } | null {
  const outcomes = parseOutcomeLabels(m.outcomes).map((x) => x.trim().toLowerCase());
  const prices = parseOutcomePrices(m.outcomePrices);
  if (!outcomes.length || outcomes.length !== prices.length) return null;

  const yesIdx = outcomes.indexOf("yes");
  const noIdx = outcomes.indexOf("no");
  if (yesIdx < 0 || noIdx < 0) return null;

  const yesRaw = prices[yesIdx];
  const noRaw = prices[noIdx];
  const yes = yesRaw <= 1 ? yesRaw * 100 : yesRaw;
  const no = noRaw <= 1 ? noRaw * 100 : noRaw;

  return { yesProb: yes, noProb: no };
}

export async function getPolymarketNativeBins(targetDate: string, cityId = "nyc"): Promise<PolymarketNativeResult> {
  const useReal = process.env.POLYMARKET_USE_REAL === "true";
  if (!useReal) {
    return {
      status: "degraded",
      reason: "POLYMARKET_USE_REAL=false",
      source: "market-disabled",
      eventId: null,
      bins: [],
      updatedAtUtc: new Date().toISOString(),
    };
  }

  const entry = getMarketEntry(targetDate, cityId);
  if (!entry?.slug) {
    return {
      status: "degraded",
      reason: "no_slug_registry_entry_for_native_bins",
      source: "market-no-registry-slug",
      eventId: null,
      bins: [],
      updatedAtUtc: new Date().toISOString(),
    };
  }

  const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(entry.slug)}`;

  try {
    const res = await fetchWithRetry(url, {}, RETRY_POLYMARKET);
    const payload = (await res.json()) as unknown;
    const events = Array.isArray(payload) ? payload : [];
    const event = (events[0] ?? null) as Record<string, unknown> | null;
    const eventId = event ? String(event.id ?? event.eventId ?? "").trim() || null : null;

    const markets = event ? (asArray(event.markets).filter((x): x is Record<string, unknown> => !!x && typeof x === "object")) : [];
    const bins: NativeBin[] = [];

    for (const m of markets) {
      const question = typeof m.question === "string" ? m.question : "";
      if (!question) continue;

      const parsed = parseQuestionToBin(question);
      if (!parsed) continue;

      const yn = yesNoFromMarket(m);
      if (!yn) continue;

      bins.push({
        key: parsed.key,
        label: parsed.label,
        order: parsed.order,
        unit: parsed.unit,
        minF: parsed.minF,
        maxF: parsed.maxF,
        yesProb: yn.yesProb,
        noProb: yn.noProb,
        question,
      });
    }

    bins.sort((a, b) => a.order - b.order);

    return {
      status: bins.length ? "healthy" : "degraded",
      reason: bins.length ? "ok" : "no_binary_bins_found",
      source: url,
      eventId,
      bins: bins.map(({ order, ...rest }) => rest),
      updatedAtUtc: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
      source: "polymarket-native-error",
      eventId: null,
      bins: [],
      updatedAtUtc: new Date().toISOString(),
    };
  }
}
