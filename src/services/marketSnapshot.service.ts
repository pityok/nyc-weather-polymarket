import { createMarketSnapshot } from "../db/forecastRepo.js";
import type { ForecastHorizon } from "./forecastPipeline.service.js";

export type SnapshotType = "current" | "fixed_1800_msk";

function horizonOffset(horizon: ForecastHorizon): number {
  if (horizon === "today") return 0;
  if (horizon === "tomorrow") return 1;
  return 2;
}

function targetDateForHorizon(horizon: ForecastHorizon, now = new Date()) {
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + horizonOffset(horizon));
  target.setUTCHours(0, 0, 0, 0);
  return target;
}

export async function refreshMarketSnapshots(snapshotType: SnapshotType) {
  const horizons: ForecastHorizon[] = ["today", "tomorrow", "day2"];

  for (const horizon of horizons) {
    const targetDate = targetDateForHorizon(horizon);

    await createMarketSnapshot({
      targetDate,
      snapshotTimeUtc: new Date(),
      snapshotType,
      probsJson: {
        le_33: 5,
        r_34_35: 8,
        r_36_37: 12,
        r_38_39: 16,
        r_40_41: 17,
        r_42_43: 16,
        r_44_45: 12,
        r_46_47: 8,
        ge_48: 6,
      },
      source: "mock-polymarket-adapter",
    });
  }

  return { snapshotType, horizonsProcessed: horizons.length };
}
