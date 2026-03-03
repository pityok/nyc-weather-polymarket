import { describe, expect, it } from "vitest";
import { getCity, getDefaultCity, CITY_REGISTRY, VALID_CITY_IDS } from "./cities.js";

describe("city registry (P4 smoke)", () => {
  it("NYC is in the registry", () => {
    const nyc = getCity("nyc");
    expect(nyc).not.toBeNull();
    expect(nyc?.cityId).toBe("nyc");
    expect(nyc?.timezone).toBe("America/New_York");
    expect(typeof nyc?.coords.lat).toBe("number");
    expect(typeof nyc?.coords.lon).toBe("number");
  });

  it("London is in the registry", () => {
    const london = getCity("london");
    expect(london).not.toBeNull();
    expect(london?.cityId).toBe("london");
    expect(london?.timezone).toBe("Europe/London");
  });

  it("returns null for unknown city", () => {
    expect(getCity("mars")).toBeNull();
  });

  it("getDefaultCity falls back to NYC for unknown city", () => {
    const city = getDefaultCity("unknown");
    expect(city.cityId).toBe("nyc");
  });

  it("VALID_CITY_IDS contains nyc", () => {
    expect(VALID_CITY_IDS).toContain("nyc");
  });

  it("all registry entries have required fields", () => {
    for (const city of Object.values(CITY_REGISTRY)) {
      expect(city.cityId).toBeTruthy();
      expect(city.displayName).toBeTruthy();
      expect(city.timezone).toBeTruthy();
      expect(typeof city.coords.lat).toBe("number");
      expect(typeof city.coords.lon).toBe("number");
    }
  });
});
