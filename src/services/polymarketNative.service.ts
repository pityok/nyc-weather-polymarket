import { getMarketEntry } from "../market/registry.js";
import { fetchWithRetry, RETRY_POLYMARKET } from "../utils/fetchWithRetry.js";

type NativeBin = {
  key: string;
  label: string;
  order: number;
  yesProb: number;
  noProb: number;
  question: string;
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

function parseQuestionToBin(question: string): { key: string; label: string; order: number } | null {
  const q = question.toLowerCase().replace(/º/g, "°");

  const below = q.match(/be\s+(-?\d+(?:\.\d+)?)\s*°?\s*([fc])\s*or below/);
  if (below) {
    const maxF = Math.round(toF(Number(below[1]), below[2] as "f" | "c"));
    return { key: `le_${maxF}`, label: `≤${maxF}°F`, order: maxF - 1 };
  }

  const between = q.match(/between\s+(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*°?\s*([fc])/);
  if (between) {
    const a = Math.round(toF(Number(between[1]), between[3] as "f" | "c"));
    const b = Math.round(toF(Number(between[2]), between[3] as "f" | "c"));
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { key: `r_${lo}_${hi}`, label: `${lo}-${hi}°F`, order: lo };
  }

  const higher = q.match(/be\s+(-?\d+(?:\.\d+)?)\s*°?\s*([fc])\s*or higher/);
  if (higher) {
    const minF = Math.round(toF(Number(higher[1]), higher[2] as "f" | "c"));
    return { key: `ge_${minF}`, label: `≥${minF}°F`, order: 10_000 + minF };
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
