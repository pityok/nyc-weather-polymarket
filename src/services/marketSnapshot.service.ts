import { createMarketSnapshot } from "../db/forecastRepo.js";
import type { ForecastHorizon } from "./forecastPipeline.service.js";
import { config } from "../config/index.js";
import { getMarketProbabilities } from "../market/polymarket.js";
import { getDefaultCity } from "../config/cities.js";
import { parseDateUTC, targetDateForHorizonInTz } from "../utils/timeNY.js";

export type SnapshotType = "current" | "fixed_1800_msk";

export async function refreshMarketSnapshots(snapshotType: SnapshotType, cityId = config.defaultCityId) {
  const horizons: ForecastHorizon[] = ["today", "tomorrow", "day2"];
  const city = getDefaultCity(cityId);

  for (const horizon of horizons) {
    const ymd = targetDateForHorizonInTz(horizon, new Date(), city.timezone);
    const targetDate = parseDateUTC(ymd);
    const market = await getMarketProbabilities(ymd, snapshotType, cityId);

    await createMarketSnapshot({
      targetDate,
      snapshotTimeUtc: new Date(),
      snapshotType,
      probsJson: market.distribution,
      source: `${market.source}|status=${market.status}|reason=${market.statusReason}${market.eventId ? `|eventId=${market.eventId}` : ""}`,
      cityId,
    });
  }

  return { snapshotType, horizonsProcessed: horizons.length };
}
