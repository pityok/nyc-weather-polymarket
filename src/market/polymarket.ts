import {
  mapPolymarketBinaryMarketsToRanges,
  mapPolymarketToRanges,
  type PolymarketBinaryQuestionMarket,
  type PolymarketOutcome,
} from "./mapper.js";
import { normalizeDistribution, RANGES, type Distribution } from "../types/ranges.js";
import { fetchWithRetry, RETRY_POLYMARKET } from "../utils/fetchWithRetry.js";
import { getMarketEntry } from "./registry.js";

export type SnapshotType = "current" | "fixed_1800_msk";
export type MarketStatus = "healthy" | "degraded" | "failed";

type GammaMarket = Record<string, unknown>;

type ParsedMarketDistribution = {
  distribution: Distribution;
  eventId: string | null;
};

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

function parseMarketRecords(payload: unknown): GammaMarket[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter((x): x is GammaMarket => !!x && typeof x === "object");
}

function parseOutcomeLabels(value: unknown): string[] {
  return asArray(value).map((v) => String(v));
}

function parseOutcomePrices(value: unknown): number[] {
  return asArray(value).map((v) => Number(v)).filter((n) => Number.isFinite(n));
}

function extractLabelOutcomes(markets: GammaMarket[]): { outcomes: PolymarketOutcome[]; eventId: string | null } {
  const outcomes: PolymarketOutcome[] = [];
  let selectedEventId: string | null = null;

  for (const m of markets) {
    const labels = parseOutcomeLabels(m.outcomes);
    const prices = parseOutcomePrices(m.outcomePrices);
    if (!labels.length || labels.length !== prices.length) continue;

    selectedEventId = String(m.eventId ?? m.id ?? "").trim() || selectedEventId;

    for (let i = 0; i < labels.length; i += 1) {
      outcomes.push({
        label: labels[i],
        probability: prices[i] <= 1 ? prices[i] * 100 : prices[i],
      });
    }
  }

  return { outcomes, eventId: selectedEventId };
}

function extractBinaryQuestionMarkets(markets: GammaMarket[]): PolymarketBinaryQuestionMarket[] {
  const result: PolymarketBinaryQuestionMarket[] = [];

  for (const m of markets) {
    const question = typeof m.question === "string" ? m.question : "";
    const outcomes = parseOutcomeLabels(m.outcomes);
    const outcomePrices = parseOutcomePrices(m.outcomePrices);
    if (!question || !outcomes.length || outcomes.length !== outcomePrices.length) continue;

    result.push({ question, outcomes, outcomePrices });
  }

  return result;
}

function tryParseDistributionFromMarkets(markets: GammaMarket[]): ParsedMarketDistribution | null {
  const byLabels = extractLabelOutcomes(markets);
  if (byLabels.outcomes.length) {
    try {
      return {
        distribution: mapPolymarketToRanges(byLabels.outcomes),
        eventId: byLabels.eventId,
      };
    } catch {
      // Not label-format ranges (e.g., binary Yes/No markets). Fallback below.
    }
  }

  const binaryMarkets = extractBinaryQuestionMarkets(markets);
  if (binaryMarkets.length) {
    const distribution = mapPolymarketBinaryMarketsToRanges(binaryMarkets);
    if (distribution) {
      const eventId = String(markets[0]?.eventId ?? markets[0]?.id ?? "").trim() || null;
      return { distribution, eventId };
    }
  }

  return null;
}

export async function getMarketProbabilities(
  targetDate: string,
  snapshotType: SnapshotType,
  cityId = "nyc",
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
  const entry = getMarketEntry(targetDate, cityId);
  if (!entry) {
    return {
      distribution: neutralDistribution(),
      source: "market-no-registry-entry",
      eventId: null,
      snapshotType,
      status: "degraded",
      statusReason: `no_market_id_registered_for_date_city:${targetDate}:${cityId}`,
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
      statusReason: `registry_entry_for_${targetDate}_${cityId}_has_no_conditionId_or_slug`,
    };
  }

  try {
    const res = await fetchWithRetry(url, {}, RETRY_POLYMARKET);
    const marketsPayload = (await res.json()) as unknown;
    const markets = parseMarketRecords(marketsPayload);

    const parsedDirect = tryParseDistributionFromMarkets(markets);
    if (parsedDirect) {
      return {
        distribution: parsedDirect.distribution,
        source: url,
        eventId: parsedDirect.eventId,
        snapshotType,
        status: "healthy",
        statusReason: "ok",
      };
    }

    // Weather markets are often published as event-level slug with nested binary sub-markets.
    // Fallback for slug entries: read /events?slug=... and parse nested markets.
    if (entry.slug) {
      const eventsUrl = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(entry.slug)}`;
      const eventsRes = await fetchWithRetry(eventsUrl, {}, RETRY_POLYMARKET);
      const eventsPayload = (await eventsRes.json()) as unknown;
      const events = parseMarketRecords(eventsPayload);

      const nestedMarkets: GammaMarket[] = [];
      for (const e of events) {
        const eventId = String(e.id ?? e.eventId ?? "").trim() || null;
        const eventMarkets = asArray(e.markets).filter((x): x is GammaMarket => !!x && typeof x === "object");
        for (const m of eventMarkets) {
          nestedMarkets.push({ ...m, eventId: m.eventId ?? eventId });
        }
      }

      const parsedFromEvents = tryParseDistributionFromMarkets(nestedMarkets);
      if (parsedFromEvents) {
        return {
          distribution: parsedFromEvents.distribution,
          source: eventsUrl,
          eventId: parsedFromEvents.eventId,
          snapshotType,
          status: "healthy",
          statusReason: "ok",
        };
      }
    }

    return {
      distribution: neutralDistribution(),
      source: url,
      eventId: null,
      snapshotType,
      status: "degraded",
      statusReason: "no_outcomes_in_registered_market",
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
