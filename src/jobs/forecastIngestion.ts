import cron from "node-cron";
import { config } from "../config/index.js";
import { runForecastPipeline } from "../services/forecastPipeline.service.js";

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

export async function runForecastIngestionJob(): Promise<TriggerResult> {
  if (isRunning) {
    console.log("[forecast-job] skipped: already running");
    return { status: "skipped", reason: "already running" };
  }

  isRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[forecast-job] start: ${startedAt}`);

  try {
    const result = await runForecastPipeline();

    if ("runId" in result) {
      console.log(
        `[forecast-job] success runId=${result.runId} durationMs=${result.durationMs} counts=${JSON.stringify(result.counts)}`,
      );
      return { status: "started", ...result };
    }

    console.error(`[forecast-job] error durationMs=${result.durationMs} message=${result.error}`);
    return { status: "error", reason: result.error, durationMs: result.durationMs };
  } finally {
    isRunning = false;
  }
}

export function startForecastScheduler() {
  if (!config.forecastJobEnabled) {
    console.log("[forecast-job] scheduler disabled by FORECAST_JOB_ENABLED=false");
    return;
  }

  if (!cron.validate(config.forecastCron)) {
    console.error(`[forecast-job] invalid cron expression: ${config.forecastCron}`);
    return;
  }

  cron.schedule(config.forecastCron, () => {
    void runForecastIngestionJob();
  });

  console.log(`[forecast-job] scheduler started with cron=${config.forecastCron}`);
}
