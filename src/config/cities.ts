export type CityConfig = {
  cityId: string;
  displayName: string;
  coords: { lat: number; lon: number };
  timezone: string;
  marketResolverConfig?: {
    defaultSlugPrefix?: string;
  };
};

/**
 * City registry. Adding a new city = adding one entry here + POLYMARKET_MARKET_IDS env var.
 * All city-specific behaviour (coords, timezone, market resolver) is driven from this config.
 */
export const CITY_REGISTRY: Record<string, CityConfig> = {
  nyc: {
    cityId: "nyc",
    displayName: "New York City (LaGuardia)",
    coords: { lat: 40.7769, lon: -73.874 },
    timezone: "America/New_York",
    marketResolverConfig: { defaultSlugPrefix: "highest-temperature-in-nyc" },
  },
};

export function getCity(cityId: string): CityConfig | null {
  return CITY_REGISTRY[cityId] ?? null;
}

/** Returns city config, falls back to NYC if cityId not found. */
export function getDefaultCity(cityId: string): CityConfig {
  return CITY_REGISTRY[cityId] ?? CITY_REGISTRY.nyc;
}

export const VALID_CITY_IDS = Object.keys(CITY_REGISTRY) as [string, ...string[]];
