import { mapPolymarketToRanges, type PolymarketOutcome } from "./mapper.js";
import { normalizeDistribution, RANGES, type Distribution } from "../types/ranges.js";

export type SnapshotType = "current" | "fixed_1800_msk";
export type MarketStatus = "healthy" | "degraded" | "failed";

export type MarketResult = {
  distribution: Distribution;
  source: string;
  eventId: string | null;
  snapshotType: SnapshotType;
  status: MarketStatus;
  statusReason: string;
};

function neutralDistribution(): Distribution {
  // Neutral fallback: no synthetic market edge; all bins equal
  const eq = Object.fromEntries(RANGES.map((k) => [k, 1])) as Partial<Record<(typeof RANGES)[number], number>>;
  return normalizeDistribution(eq);
}

export async function getMarketProbabilities(targetDate: string, snapshotType: SnapshotType): Promise<MarketResult> {
  const useReal = process.env.POLYMARKET_USE_REAL === "true";

  if (!useReal) {
    return {
      distribution: neutralDistribution(),
      source: "market-disabled",
      eventId: null,
      snapshotType,
      status: "degraded",
      statusReason: "POLYMARKET_USE_REAL=false",
    };
  }

  try {
    const url = "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=1000";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const markets = (await res.json()) as Array<Record<string, unknown>>;

    const candidates = markets.filter((m) => {
      const s = `${String(m.slug || "")} ${String(m.question || m.title || "")}`.toLowerCase();
      return s.includes("highest-temperature-in-nyc") || (s.includes("nyc") && s.includes("temperature"));
    });

    const outcomes: PolymarketOutcome[] = [];
    let selectedEventId: string | null = null;

    for (const m of candidates) {
      const s = `${String(m.slug || "")} ${String(m.question || m.title || "")}`;
      // accept exact date or month/day textual mentions
      if (targetDate && !s.includes(targetDate) && !s.toLowerCase().includes("march") && !s.toLowerCase().includes("february")) {
        continue;
      }

      const outcomesRaw = m.outcomes;
      const pricesRaw = m.outcomePrices;
      if (!Array.isArray(outcomesRaw) || !Array.isArray(pricesRaw)) continue;

      selectedEventId = String(m.eventId || m.id || "").trim() || null;
      for (let i = 0; i < outcomesRaw.length; i += 1) {
        outcomes.push({
          label: String(outcomesRaw[i]),
          probability: Number(pricesRaw[i]) * 100,
        });
      }
    }

    if (!outcomes.length) {
      return {
        distribution: neutralDistribution(),
        source: url,
        eventId: null,
        snapshotType,
        status: "degraded",
        statusReason: "No matching NYC temperature outcomes",
      };
    }

    return {
      distribution: mapPolymarketToRanges(outcomes),
      source: url,
      eventId: selectedEventId,
      snapshotType,
      status: "healthy",
      statusReason: "ok",
    };
  } catch (error) {
    return {
      distribution: neutralDistribution(),
      source: "polymarket-error",
      eventId: null,
      snapshotType,
      status: "failed",
      statusReason: error instanceof Error ? error.message : String(error),
    };
  }
}
