import cron from "node-cron";
import { config } from "../config/index.js";
import { runForecastPipeline, type ForecastHorizon } from "../services/forecastPipeline.service.js";
import { refreshMarketSnapshots } from "../services/marketSnapshot.service.js";
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

export async function runForecastIngestionJob(horizon: ForecastHorizon = "tomorrow"): Promise<TriggerResult> {
  if (isRunning) {
    logWithTime("forecast-job", `skipped: already running (horizon=${horizon})`);
    return { status: "skipped", reason: "already running" };
  }

  isRunning = true;
  logWithTime("forecast-job", `start horizon=${horizon}`);

  try {
    const result = await runForecastPipeline(horizon);

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

export function startForecastScheduler() {
  if (!config.forecastJobEnabled) {
    logWithTime("forecast-job", "scheduler disabled by FORECAST_JOB_ENABLED=false");
    return;
  }

  const timezone = "Europe/Moscow";

  // 00:00, 06:00, 12:00, 18:00 MSK: collect today/tomorrow/day2 forecasts
  cron.schedule(
    "0 0,6,12,18 * * *",
    () => {
      const horizons: ForecastHorizon[] = ["today", "tomorrow", "day2"];
      for (const horizon of horizons) {
        void runForecastIngestionJob(horizon);
      }
    },
    { timezone },
  );

  // Every 10 minutes: refresh current market snapshots
  cron.schedule(
    "*/10 * * * *",
    () => {
      void refreshMarketSnapshots("current").then((result) => {
        logWithTime(
          "market-snapshot",
          `refreshed type=${result.snapshotType} horizons=${result.horizonsProcessed}`,
        );
      });
    },
    { timezone },
  );

  // 18:00 MSK: persist fixed snapshot
  cron.schedule(
    "0 18 * * *",
    () => {
      void refreshMarketSnapshots("fixed_1800_msk").then((result) => {
        logWithTime(
          "market-snapshot",
          `fixed snapshot saved type=${result.snapshotType} horizons=${result.horizonsProcessed}`,
        );
      });
    },
    { timezone },
  );

  logWithTime("forecast-job", `scheduler started timezone=${timezone}`);
}
