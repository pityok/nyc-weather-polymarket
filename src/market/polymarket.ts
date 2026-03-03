import { mapPolymarketToRanges, type PolymarketOutcome } from "./mapper.js";
import { normalizeDistribution, RANGES, type Distribution } from "../types/ranges.js";
import { fetchWithRetry, RETRY_POLYMARKET } from "../utils/fetchWithRetry.js";
import { getMarketEntry } from "./registry.js";

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
  const eq = Object.fromEntries(RANGES.map((k) => [k, 1])) as Partial<Record<(typeof RANGES)[number], number>>;
  return normalizeDistribution(eq);
}

export async function getMarketProbabilities(
  targetDate: string,
  snapshotType: SnapshotType,
  _cityId = "nyc",
): Promise<MarketResult> {
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

  // ID-first: require a stable market entry in the registry.
  // No substring/slug guessing — if no entry, return degraded immediately.
  const entry = getMarketEntry(targetDate);
  if (!entry) {
    return {
      distribution: neutralDistribution(),
      source: "market-no-registry-entry",
      eventId: null,
      snapshotType,
      status: "degraded",
      statusReason: `no_market_id_registered_for_date:${targetDate}`,
    };
  }

  let url: string;
  if (entry.conditionId) {
    url = `https://gamma-api.polymarket.com/markets?conditionId=${encodeURIComponent(entry.conditionId)}`;
  } else if (entry.slug) {
    url = `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(entry.slug)}`;
  } else {
    return {
      distribution: neutralDistribution(),
      source: "market-invalid-registry-entry",
      eventId: null,
      snapshotType,
      status: "degraded",
      statusReason: `registry_entry_for_${targetDate}_has_no_conditionId_or_slug`,
    };
  }

  try {
    const res = await fetchWithRetry(url, {}, RETRY_POLYMARKET);
    const markets = (await res.json()) as Array<Record<string, unknown>>;

    const outcomes: PolymarketOutcome[] = [];
    let selectedEventId: string | null = null;

    for (const m of markets) {
      const outcomesRaw = m.outcomes;
      const pricesRaw = m.outcomePrices;
      if (!Array.isArray(outcomesRaw) || !Array.isArray(pricesRaw)) continue;

      selectedEventId = String(m.eventId ?? m.id ?? "").trim() || null;
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
        statusReason: "no_outcomes_in_registered_market",
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
