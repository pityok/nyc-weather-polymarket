export type MarketRegistryEntry = {
  conditionId?: string;
  slug?: string;
};

/**
 * Static known market IDs, keyed by target date (YYYY-MM-DD).
 * Add entries here when new Polymarket markets are created.
 * Can also be extended at runtime via POLYMARKET_MARKET_IDS env var (JSON).
 *
 * Example POLYMARKET_MARKET_IDS:
 *   {"2026-03-05":{"conditionId":"0xabc..."},"2026-03-06":{"slug":"highest-temperature-in-nyc-march-6"}}
 */
const STATIC_REGISTRY: Record<string, MarketRegistryEntry> = {};

function loadEnvRegistry(): Record<string, MarketRegistryEntry> {
  const raw = process.env.POLYMARKET_MARKET_IDS;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, MarketRegistryEntry>;
  } catch {
    console.warn("[market/registry] POLYMARKET_MARKET_IDS is not valid JSON, ignoring");
    return {};
  }
}

let _envRegistry: Record<string, MarketRegistryEntry> | null = null;

export function getMarketEntry(targetDate: string): MarketRegistryEntry | null {
  if (!_envRegistry) _envRegistry = loadEnvRegistry();
  return _envRegistry[targetDate] ?? STATIC_REGISTRY[targetDate] ?? null;
}

/** For tests only: reset cached env registry. */
export function _resetRegistryCache(): void {
  _envRegistry = null;
}
