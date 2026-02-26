import { createForecastRunPayloadSchema, type CreateForecastRunPayload } from "../types/forecastRunPayload.js";
import { createForecastRunWithData } from "./forecastRun.service.js";

export type PipelineSuccess = {
  runId: string;
  durationMs: number;
  counts: {
    modelForecasts: number;
    consensuses: number;
    edgeSignals: number;
  };
};

export type PipelineFailure = {
  error: string;
  durationMs: number;
};

export type PipelineResult = PipelineSuccess | PipelineFailure;

export function gatherForecastPayload(now = new Date()): CreateForecastRunPayload {
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + 1);
  target.setUTCHours(0, 0, 0, 0);

  return {
    run: {
      runTimeUtc: now,
      runTimeMsk: new Date(now.getTime() + 3 * 60 * 60 * 1000),
      targetDate: target,
      horizon: "tomorrow",
    },
    modelForecasts: [
      {
        modelId: "mock-model",
        modelName: "Mock Model",
        confidence: "medium",
        rawResponse: { source: "mock" },
        probsJson: { "20-25": 0.4, "25-30": 0.6 },
        sumBeforeNormalization: 1,
      },
    ],
    consensuses: [
      {
        method: "simple",
        probsJson: { "20-25": 0.4, "25-30": 0.6 },
      },
    ],
    edgeSignals: [
      {
        targetDate: target,
        rangeKey: "25-30",
        aiProb: 0.6,
        marketProb: 0.45,
        edge: 0.15,
        recommendation: "bet",
        reason: "Mock edge above threshold",
      },
    ],
    marketSnapshot: {
      targetDate: target,
      snapshotTimeUtc: now,
      snapshotType: "current",
      probsJson: { "20-25": 0.45, "25-30": 0.55 },
      source: "mock-market",
    },
  };
}

export async function runForecastPipeline(): Promise<PipelineResult> {
  const started = Date.now();

  try {
    const payload = createForecastRunPayloadSchema.parse(gatherForecastPayload());
    const result = await createForecastRunWithData(payload);

    return {
      runId: result.runId,
      durationMs: Date.now() - started,
      counts: {
        modelForecasts: payload.modelForecasts.length,
        consensuses: payload.consensuses.length,
        edgeSignals: payload.edgeSignals.length,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown pipeline error",
      durationMs: Date.now() - started,
    };
  }
}
