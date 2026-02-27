import { mapPolymarketToRanges, type PolymarketOutcome } from "./mapper.js";

export type SnapshotType = "current" | "fixed_1800_msk";

export async function getMarketProbabilities(targetDate: string, snapshotType: SnapshotType) {
  const useReal = process.env.POLYMARKET_USE_REAL === "true";

  if (!useReal) {
    return {
      distribution: mapPolymarketToRanges([
        { label: "<=33", probability: 5 },
        { label: "34-35", probability: 8 },
        { label: "36-37", probability: 12 },
        { label: "38-39", probability: 16 },
        { label: "40-41", probability: 17 },
        { label: "42-43", probability: 16 },
        { label: "44-45", probability: 12 },
        { label: "46-47", probability: 8 },
        { label: ">=48", probability: 6 },
      ]),
      source: "mock-polymarket",
      eventId: null,
      snapshotType,
    };
  }

  try {
    const url = "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=500";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const markets = (await res.json()) as Array<Record<string, unknown>>;

    const t = targetDate;
    const candidates = markets.filter((m) => {
      const q = String(m.question || m.title || "").toLowerCase();
      return q.includes("laguardia") || q.includes("new york") || q.includes("nyc");
    });

    const outcomes: PolymarketOutcome[] = [];
    for (const m of candidates) {
      const q = String(m.question || m.title || "");
      if (t && !q.includes(t)) continue;

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

    if (!outcomes.length) throw new Error("No matching weather outcomes");

    return {
      distribution: mapPolymarketToRanges(outcomes),
      source: url,
      eventId: null,
      snapshotType,
    };
  } catch (error) {
    console.error(`[polymarket] fallback to mock: ${error instanceof Error ? error.message : String(error)}`);
    return {
      distribution: mapPolymarketToRanges([
        { label: "<=33", probability: 5 },
        { label: "34-35", probability: 8 },
        { label: "36-37", probability: 12 },
        { label: "38-39", probability: 16 },
        { label: "40-41", probability: 17 },
        { label: "42-43", probability: 16 },
        { label: "44-45", probability: 12 },
        { label: "46-47", probability: 8 },
        { label: ">=48", probability: 6 },
      ]),
      source: "mock-polymarket-fallback",
      eventId: null,
      snapshotType,
    };
  }
}
