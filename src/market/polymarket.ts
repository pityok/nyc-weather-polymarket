import { mapPolymarketToRanges, type PolymarketOutcome } from "./mapper.js";

export type SnapshotType = "current" | "fixed_1800_msk";

function mockOutcomes(): PolymarketOutcome[] {
  return [
    { label: "<=33", probability: 2 },
    { label: "34-35", probability: 3 },
    { label: "36-37", probability: 5 },
    { label: "38-39", probability: 8 },
    { label: "40-41", probability: 11 },
    { label: "42-43", probability: 13 },
    { label: "44-45", probability: 15 },
    { label: "46-47", probability: 16 },
    { label: "48-49", probability: 13 },
    { label: "50-51", probability: 8 },
    { label: "52-53", probability: 4 },
    { label: "54+", probability: 2 },
  ];
}

export async function getMarketProbabilities(targetDate: string, snapshotType: SnapshotType) {
  const useReal = process.env.POLYMARKET_USE_REAL === "true";

  if (!useReal) {
    return {
      distribution: mapPolymarketToRanges(mockOutcomes()),
      source: "mock-polymarket",
      eventId: null,
      snapshotType,
    };
  }

  try {
    const url = "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=1000";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const markets = (await res.json()) as Array<Record<string, unknown>>;

    const t = targetDate;
    const candidates = markets.filter((m) => {
      const s = `${String(m.slug || "")} ${String(m.question || m.title || "")}`.toLowerCase();
      return s.includes("highest-temperature-in-nyc") || (s.includes("nyc") && s.includes("temperature"));
    });

    const outcomes: PolymarketOutcome[] = [];
    for (const m of candidates) {
      const s = `${String(m.slug || "")} ${String(m.question || m.title || "")}`;
      if (t && !s.includes(t)) continue;

      const outcomesRaw = m.outcomes;
      const pricesRaw = m.outcomePrices;
      if (!Array.isArray(outcomesRaw) || !Array.isArray(pricesRaw)) continue;
      for (let i = 0; i < outcomesRaw.length; i += 1) {
        outcomes.push({
          label: String(outcomesRaw[i]),
          probability: Number(pricesRaw[i]) * 100,
        });
      }
    }

    if (!outcomes.length) throw new Error("No matching NYC temperature outcomes");

    return {
      distribution: mapPolymarketToRanges(outcomes),
      source: url,
      eventId: null,
      snapshotType,
    };
  } catch (error) {
    console.error(`[polymarket] fallback to mock: ${error instanceof Error ? error.message : String(error)}`);
    return {
      distribution: mapPolymarketToRanges(mockOutcomes()),
      source: "mock-polymarket-fallback",
      eventId: null,
      snapshotType,
    };
  }
}
