import { llmAdapters } from "../adapters/index.js";
import { getMarketProbabilities } from "../market/polymarket.js";
import { createForecastRunPayloadSchema, type CreateForecastRunPayload } from "../types/forecastRunPayload.js";
import { normalizeDistribution, RANGES, type Distribution } from "../types/ranges.js";
import { createForecastRunWithData } from "./forecastRun.service.js";
import { computeEdgeRecommendation } from "./edge.service.js";

export type ForecastHorizon = "today" | "tomorrow" | "day2";

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

function horizonOffset(horizon: ForecastHorizon): number {
  if (horizon === "today") return 0;
  if (horizon === "tomorrow") return 1;
  return 2;
}

function averageDistribution(dists: Distribution[]): Distribution {
  const sums = Object.fromEntries(RANGES.map((k) => [k, 0])) as Distribution;
  for (const d of dists) {
    for (const k of RANGES) sums[k] += d[k];
  }
  const n = dists.length || 1;
  return normalizeDistribution(Object.fromEntries(RANGES.map((k) => [k, sums[k] / n])));
}

export async function gatherForecastPayload(
  horizon: ForecastHorizon = "tomorrow",
  now = new Date(),
): Promise<CreateForecastRunPayload> {
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + horizonOffset(horizon));
  target.setUTCHours(0, 0, 0, 0);

  const settled = await Promise.allSettled(
    llmAdapters.map((adapter) =>
      adapter.getForecast({
        targetDate: target.toISOString().slice(0, 10),
        location: "NYC LaGuardia",
      }),
    ),
  );

  const ok = settled.filter((s): s is PromiseFulfilledResult<Awaited<ReturnType<(typeof llmAdapters)[0]["getForecast"]>>> => s.status === "fulfilled");
  const failed = settled.filter((s) => s.status === "rejected");

  if (failed.length) {
    console.error(`[pipeline] alert: ${failed.length} model(s) failed, using partial consensus`);
  }
  if (!ok.length) {
    throw new Error("All model forecasts failed");
  }

  const modelForecasts = ok.map((s) => ({
    modelId: s.value.modelId,
    modelName: s.value.modelName,
    confidence: s.value.confidence,
    rawResponse: s.value.raw,
    probsJson: s.value.probs,
    sumBeforeNormalization: s.value.sumBeforeNormalization,
  }));

  const distList = ok.map((s) => normalizeDistribution(s.value.probs));
  const simple = averageDistribution(distList);
  const weighted = averageDistribution(distList); // placeholder: equal weights until weekly weights are used

  const market = await getMarketProbabilities(target.toISOString().slice(0, 10), "current");
  const marketDist = market.distribution;

  const edgeSignals = RANGES.map((rangeKey) => {
    const aiProb = simple[rangeKey];
    const marketProb = marketDist[rangeKey];
    const { edge, recommendation } = computeEdgeRecommendation(aiProb, marketProb);
    return {
      targetDate: target,
      rangeKey,
      aiProb,
      marketProb,
      edge,
      recommendation,
      reason: recommendation === "bet" ? "Edge & probability above thresholds" : "Below thresholds",
    };
  });

  return {
    run: {
      runTimeUtc: now,
      runTimeMsk: new Date(now.getTime() + 3 * 60 * 60 * 1000),
      targetDate: target,
      horizon,
    },
    modelForecasts,
    consensuses: [
      { method: "simple", probsJson: simple },
      { method: "weighted", probsJson: weighted },
    ],
    edgeSignals,
    marketSnapshot: {
      targetDate: target,
      snapshotTimeUtc: now,
      snapshotType: "current",
      probsJson: marketDist,
      source: market.source,
    },
  };
}

export async function runForecastPipeline(horizon: ForecastHorizon = "tomorrow"): Promise<PipelineResult> {
  const started = Date.now();

  try {
    const payload = createForecastRunPayloadSchema.parse(await gatherForecastPayload(horizon));
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
