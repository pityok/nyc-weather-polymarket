export type MarketRegistryEntry = {
  conditionId?: string;
  slug?: string;
};

type RawMarketRegistryValue = MarketRegistryEntry | string;

/**
 * Static known market IDs.
 *
 * Supported key formats:
 *  - "YYYY-MM-DD:cityId" (preferred, city-aware)
 *  - "YYYY-MM-DD"        (legacy fallback for default/NYC flows)
 *
 * Supported value formats:
 *  - { conditionId: "0x..." }
 *  - { slug: "highest-temperature-in-nyc-on-march-5-2026" }
 *  - "0x..." (conditionId shorthand)
 *  - "highest-temperature-in-nyc-on-march-5-2026" (slug shorthand)
 */
const STATIC_REGISTRY: Record<string, RawMarketRegistryValue> = {};

function normalizeEntry(value: RawMarketRegistryValue | undefined | null): MarketRegistryEntry | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("0x")) return { conditionId: trimmed };
    return { slug: trimmed };
  }

  const conditionId = value.conditionId?.trim();
  const slug = value.slug?.trim();
  if (!conditionId && !slug) return null;

  return {
    ...(conditionId ? { conditionId } : {}),
    ...(slug ? { slug } : {}),
  };
}

function loadEnvRegistry(): Record<string, RawMarketRegistryValue> {
  const raw = process.env.POLYMARKET_MARKET_IDS;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, RawMarketRegistryValue>;
  } catch {
    console.warn("[market/registry] POLYMARKET_MARKET_IDS is not valid JSON, ignoring");
    return {};
  }
}

let _envRegistry: Record<string, RawMarketRegistryValue> | null = null;

function keyByDateCity(targetDate: string, cityId: string): string {
  return `${targetDate}:${cityId}`;
}

export function getMarketEntry(targetDate: string, cityId = "nyc"): MarketRegistryEntry | null {
  if (!_envRegistry) _envRegistry = loadEnvRegistry();

  const cityKey = keyByDateCity(targetDate, cityId);
  return (
    normalizeEntry(_envRegistry[cityKey]) ??
    normalizeEntry(STATIC_REGISTRY[cityKey]) ??
    normalizeEntry(_envRegistry[targetDate]) ??
    normalizeEntry(STATIC_REGISTRY[targetDate]) ??
    null
  );
}

/** For tests only: reset cached env registry. */
export function _resetRegistryCache(): void {
  _envRegistry = null;
}
