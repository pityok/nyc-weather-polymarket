import cron from "node-cron";
import { config } from "../config/index.js";
import { runForecastPipeline, type ForecastHorizon } from "../services/forecastPipeline.service.js";
import { refreshMarketSnapshots } from "../services/marketSnapshot.service.js";
import { VALID_CITY_IDS } from "../config/cities.js";
import { logWithTime } from "../utils/time.js";

type TriggerResult =
  | {
      status: "started";
      runId: string;
      durationMs: number;
      counts: { modelForecasts: number; consensuses: number; edgeSignals: number };
    }
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "error";
      reason: string;
      durationMs: number;
    };

let isRunning = false;

export function isForecastJobRunning() {
  return isRunning;
}

export function __resetForecastJobLock() {
  isRunning = false;
}

export async function runForecastIngestionJob(
  horizon: ForecastHorizon = "tomorrow",
  cityId = config.defaultCityId,
): Promise<TriggerResult> {
  if (isRunning) {
    logWithTime("forecast-job", `skipped: already running (horizon=${horizon})`);
    return { status: "skipped", reason: "already running" };
  }

  isRunning = true;
  logWithTime("forecast-job", `start horizon=${horizon} cityId=${cityId}`);

  try {
    const result = await runForecastPipeline(horizon, cityId);

    if ("runId" in result) {
      logWithTime(
        "forecast-job",
        `success horizon=${horizon} runId=${result.runId} durationMs=${result.durationMs} counts=${JSON.stringify(result.counts)}`,
      );
      return { status: "started", ...result };
    }

    logWithTime("forecast-job", `error horizon=${horizon} durationMs=${result.durationMs} message=${result.error}`);
    return { status: "error", reason: result.error, durationMs: result.durationMs };
  } finally {
    isRunning = false;
  }
}

async function runForecastBatch(cityId = config.defaultCityId) {
  const horizons: ForecastHorizon[] = ["today", "tomorrow", "day2"];
  for (const horizon of horizons) {
    // sequential on purpose: shared lock + predictable order
    await runForecastIngestionJob(horizon, cityId);
  }
}

export function startForecastScheduler() {
  if (!config.forecastJobEnabled) {
    logWithTime("forecast-job", "scheduler disabled by FORECAST_JOB_ENABLED=false");
    return;
  }

  const timezone = "Europe/Moscow";

  // 00:00, 06:00, 12:00, 18:00 MSK: collect today/tomorrow/day2 forecasts for all cities
  cron.schedule(
    "0 0,6,12,18 * * *",
    () => {
      void (async () => {
        for (const cityId of VALID_CITY_IDS) await runForecastBatch(cityId);
      })();
    },
    { timezone },
  );

  // Every 10 minutes: refresh current market snapshots for all cities
  cron.schedule(
    "*/10 * * * *",
    () => {
      void (async () => {
        for (const cityId of VALID_CITY_IDS) {
          const result = await refreshMarketSnapshots("current", cityId);
          logWithTime(
            "market-snapshot",
            `refreshed type=${result.snapshotType} cityId=${cityId} horizons=${result.horizonsProcessed}`,
          );
        }
      })();
    },
    { timezone },
  );

  // 18:00 MSK: persist fixed snapshot for all cities
  cron.schedule(
    "0 18 * * *",
    () => {
      void (async () => {
        for (const cityId of VALID_CITY_IDS) {
          const result = await refreshMarketSnapshots("fixed_1800_msk", cityId);
          logWithTime(
            "market-snapshot",
            `fixed snapshot saved type=${result.snapshotType} cityId=${cityId} horizons=${result.horizonsProcessed}`,
          );
        }
      })();
    },
    { timezone },
  );

  logWithTime("forecast-job", `scheduler started timezone=${timezone}`);
}
