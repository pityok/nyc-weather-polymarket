export type NoaaWundCity = {
  cityId: string;
  displayName: string;
  stationCode: string;
  coords: { lat: number; lon: number };
  timezone: string;
  polymarketSlugCity: string;
  wundPath: string;
};

const CITIES: NoaaWundCity[] = [
  {
    cityId: "NYC",
    displayName: "NYC (KLGA)",
    stationCode: "KLGA",
    coords: { lat: 40.76, lon: -73.86 },
    timezone: "America/New_York",
    polymarketSlugCity: "nyc",
    wundPath: "us/ny/new-york-city/KLGA",
  },
  {
    cityId: "MIA",
    displayName: "MIA (KMIA)",
    stationCode: "KMIA",
    coords: { lat: 25.85, lon: -80.24 },
    timezone: "America/New_York",
    polymarketSlugCity: "miami",
    wundPath: "us/fl/miami/KMIA",
  },
  {
    cityId: "SEA",
    displayName: "SEA (KSEA)",
    stationCode: "KSEA",
    coords: { lat: 47.44, lon: -122.3 },
    timezone: "America/Los_Angeles",
    polymarketSlugCity: "seattle",
    wundPath: "us/wa/seattle/KSEA",
  },
  {
    cityId: "ATL",
    displayName: "ATL (KATL)",
    stationCode: "KATL",
    coords: { lat: 33.64, lon: -84.41 },
    timezone: "America/New_York",
    polymarketSlugCity: "atlanta",
    wundPath: "us/ga/atlanta/KATL",
  },
  {
    cityId: "DAL",
    displayName: "DAL (KDAL)",
    stationCode: "KDAL",
    coords: { lat: 32.85, lon: -96.87 },
    timezone: "America/Chicago",
    polymarketSlugCity: "dallas",
    wundPath: "us/tx/dallas/KDAL",
  },
  {
    cityId: "CHI",
    displayName: "CHI (KORD)",
    stationCode: "KORD",
    coords: { lat: 41.98, lon: -87.91 },
    timezone: "America/Chicago",
    polymarketSlugCity: "chicago",
    wundPath: "us/il/chicago/KORD",
  },
  {
    cityId: "LA",
    displayName: "LA (KLAX)",
    stationCode: "KLAX",
    coords: { lat: 33.96, lon: -118.4 },
    timezone: "America/Los_Angeles",
    polymarketSlugCity: "los-angeles",
    wundPath: "us/ca/los-angeles/KLAX",
  },
  {
    cityId: "DEN",
    displayName: "DEN (KBKF)",
    stationCode: "KBKF",
    coords: { lat: 39.7, lon: -104.76 },
    timezone: "America/Denver",
    polymarketSlugCity: "denver",
    wundPath: "us/co/denver/KBKF",
  },
  {
    cityId: "AUS",
    displayName: "AUS (KAUS)",
    stationCode: "KAUS",
    coords: { lat: 30.16, lon: -97.69 },
    timezone: "America/Chicago",
    polymarketSlugCity: "austin",
    wundPath: "us/tx/austin/KAUS",
  },
  {
    cityId: "SF",
    displayName: "SF (KSFO)",
    stationCode: "KSFO",
    coords: { lat: 37.62, lon: -122.39 },
    timezone: "America/Los_Angeles",
    polymarketSlugCity: "san-francisco",
    wundPath: "us/ca/san-francisco/KSFO",
  },
  {
    cityId: "HOU",
    displayName: "HOU (KHOU)",
    stationCode: "KHOU",
    coords: { lat: 29.63, lon: -95.25 },
    timezone: "America/Chicago",
    polymarketSlugCity: "houston",
    wundPath: "us/tx/houston/KHOU",
  },
  {
    cityId: "SEO",
    displayName: "SEO (RKSI)",
    stationCode: "RKSI",
    coords: { lat: 37.49, lon: 126.49 },
    timezone: "Asia/Seoul",
    polymarketSlugCity: "seoul",
    wundPath: "kr/seoul/RKSI",
  },
  {
    cityId: "LON",
    displayName: "LON (EGLC)",
    stationCode: "EGLC",
    coords: { lat: 51.51, lon: 0.03 },
    timezone: "Europe/London",
    polymarketSlugCity: "london",
    wundPath: "gb/eng/london/EGLC",
  },
  {
    cityId: "WEL",
    displayName: "WEL (NZWN)",
    stationCode: "NZWN",
    coords: { lat: -41.32, lon: 174.8 },
    timezone: "Pacific/Auckland",
    polymarketSlugCity: "wellington",
    wundPath: "nz/wellington/NZWN",
  },
  {
    cityId: "TOR",
    displayName: "TOR (CYYZ)",
    stationCode: "CYYZ",
    coords: { lat: 43.71, lon: -79.66 },
    timezone: "America/Toronto",
    polymarketSlugCity: "toronto",
    wundPath: "ca/on/toronto/CYYZ",
  },
];

const BY_ID = new Map(CITIES.map((city) => [city.cityId, city]));

export const NOAA_WUND_CITY_IDS = CITIES.map((city) => city.cityId) as [string, ...string[]];
export const NOAA_WUND_CITIES = CITIES;

export function getNoaaWundCity(cityId: string): NoaaWundCity | null {
  return BY_ID.get(cityId.toUpperCase()) ?? null;
}

export function getNoaaWundDefaultCity(cityId?: string): NoaaWundCity {
  const found = cityId ? getNoaaWundCity(cityId) : null;
  return found ?? CITIES[0];
}
