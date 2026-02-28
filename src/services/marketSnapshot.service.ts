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
        le_33: 2,
        r_34_35: 3,
        r_36_37: 5,
        r_38_39: 8,
        r_40_41: 11,
        r_42_43: 13,
        r_44_45: 15,
        r_46_47: 16,
        r_48_49: 13,
        r_50_51: 8,
        r_52_53: 4,
        ge_54: 2,
      },
      source: "mock-polymarket-adapter",
    });
  }

  return { snapshotType, horizonsProcessed: horizons.length };
}
