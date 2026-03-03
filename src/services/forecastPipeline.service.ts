import { llmAdapters } from "../adapters/index.js";
import { config } from "../config/index.js";
import { getMarketProbabilities } from "../market/polymarket.js";
import { createForecastRunPayloadSchema, type CreateForecastRunPayload } from "../types/forecastRunPayload.js";
import { normalizeDistribution, RANGES, type Distribution, type RangeKey } from "../types/ranges.js";
import { createForecastRunWithData } from "./forecastRun.service.js";
import { computeEdgeRecommendation } from "./edge.service.js";
import { computeModelWeights7d } from "./modelWeights.service.js";
import { fetchWithRetry, RETRY_OPEN_METEO } from "../utils/fetchWithRetry.js";
import type { LLMForecastResult } from "../llm/types.js";

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

/**
 * Weighted distribution using per-model quality weights.
 * Falls back to equal-weight average if a model has no weight entry.
 */
export function weightedDistribution(
  models: Array<{ modelId: string; dist: Distribution }>,
  weights: Map<string, number>,
): Distribution {
  const sums = Object.fromEntries(RANGES.map((k) => [k, 0])) as Distribution;
  let totalWeight = 0;

  for (const { modelId, dist } of models) {
    const w = weights.get(modelId) ?? 0;
    for (const k of RANGES) sums[k] += dist[k] * w;
    totalWeight += w;
  }

  if (totalWeight <= 0) {
    return averageDistribution(models.map((m) => m.dist));
  }

  return normalizeDistribution(Object.fromEntries(RANGES.map((k) => [k, sums[k] / totalWeight])));
}

function rangeCenterF(k: RangeKey): number {
  const map: Record<RangeKey, number> = {
    le_33: 32,
    r_34_35: 34.5,
    r_36_37: 36.5,
    r_38_39: 38.5,
    r_40_41: 40.5,
    r_42_43: 42.5,
    r_44_45: 44.5,
    r_46_47: 46.5,
    r_48_49: 48.5,
    r_50_51: 50.5,
    r_52_53: 52.5,
    ge_54: 55,
  };
  return map[k];
}

function gaussianDistFromMax(maxF: number, sigma = 3.0): Distribution {
  const raw = Object.fromEntries(
    RANGES.map((k) => {
      const c = rangeCenterF(k);
      const v = Math.exp(-((c - maxF) ** 2) / (2 * sigma * sigma));
      return [k, v * 100];
    }),
  ) as Partial<Record<RangeKey, number>>;
  return normalizeDistribution(raw);
}

async function getBaselineDistribution(targetDate: string): Promise<Distribution> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", "40.7769");
  url.searchParams.set("longitude", "-73.8740");
  url.searchParams.set("daily", "temperature_2m_max");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", "America/New_York");
  url.searchParams.set("start_date", targetDate);
  url.searchParams.set("end_date", targetDate);

  const res = await fetchWithRetry(url.toString(), {}, RETRY_OPEN_METEO);
  const data = (await res.json()) as { daily?: { temperature_2m_max?: number[] } };
  const maxF = data.daily?.temperature_2m_max?.[0];
  if (typeof maxF !== "number") throw new Error("Open-Meteo missing temperature_2m_max");
  return gaussianDistFromMax(maxF, 3.0);
}

export async function gatherForecastPayload(
  horizon: ForecastHorizon = "tomorrow",
  now = new Date(),
): Promise<CreateForecastRunPayload> {
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + horizonOffset(horizon));
  target.setUTCHours(0, 0, 0, 0);
  const targetDate = target.toISOString().slice(0, 10);

  let modelForecasts: CreateForecastRunPayload["modelForecasts"] = [];
  let simple: Distribution;
  let weighted: Distribution;
  let weightedMeta: string;

  if (config.baselineOnly) {
    const baseline = await getBaselineDistribution(targetDate);
    simple = baseline;
    weighted = baseline;
    weightedMeta = "baseline_only";
    modelForecasts = [
      {
        modelId: "baseline/open-meteo",
        modelName: "Baseline Open-Meteo",
        confidence: "medium",
        rawResponse: { targetDate, mode: "baseline_only" },
        probsJson: baseline,
        sumBeforeNormalization: 100,
      },
    ];
  } else {
    const settled = await Promise.allSettled(
      llmAdapters.map((adapter) =>
        adapter.getForecast({
          targetDate,
          location: "NYC LaGuardia",
          context: { note: "Do not use market probabilities" },
        }),
      ),
    );

    const ok = settled.filter(
      (s): s is PromiseFulfilledResult<LLMForecastResult> => s.status === "fulfilled",
    );
    const failed = settled.filter((s) => s.status === "rejected");

    if (failed.length) {
      console.error(`[pipeline] alert: ${failed.length} model(s) failed, using partial consensus`);
    }
    if (!ok.length) {
      throw new Error("All model forecasts failed");
    }

    modelForecasts = ok.map((s) => ({
      modelId: s.value.modelId,
      modelName: s.value.modelName,
      confidence: s.value.confidence,
      rawResponse: s.value.raw,
      probsJson: s.value.probs,
      sumBeforeNormalization: s.value.sumBeforeNormalization,
    }));

    const modelDists = ok.map((s) => ({
      modelId: s.value.modelId,
      dist: normalizeDistribution(s.value.probs),
    }));
    const distList = modelDists.map((m) => m.dist);
    simple = averageDistribution(distList);

    // Real weighted consensus: use 7d quality metrics (hit-rate + brier + calibration).
    // Falls back to simple average with explicit reason when data is insufficient.
    const weightsResult = await computeModelWeights7d(now);
    if (weightsResult.ok) {
      weighted = weightedDistribution(modelDists, weightsResult.weights);
      weightedMeta = `7d_quality_weights:models=${weightsResult.models.map((m) => `${m.modelId}:${m.weight.toFixed(4)}`).join(",")}`;
      console.info(`[pipeline] weighted consensus via 7d quality weights: ${weightedMeta}`);
    } else {
      weighted = simple;
      weightedMeta = `fallback_equal_weights:reason=${weightsResult.reason}`;
      console.warn(`[pipeline] weighted consensus fallback: ${weightsResult.reason}`);
    }
  }

  const market = await getMarketProbabilities(targetDate, "current");
  const marketDist = market.distribution;

  const edgeSignals = RANGES.map((rangeKey) => {
    const aiProb = simple[rangeKey];
    const marketProb = marketDist[rangeKey];
    const { edge, recommendation } = computeEdgeRecommendation(aiProb, marketProb);

    // Hard risk gate: degraded/failed market => force no_bet
    const gatedRecommendation = market.status === "healthy" ? recommendation : "no_bet";
    const reason =
      market.status === "healthy"
        ? recommendation === "bet"
          ? "Edge & probability above thresholds"
          : "Below thresholds"
        : `Market ${market.status}: ${market.statusReason}`;

    return {
      targetDate: target,
      rangeKey,
      aiProb,
      marketProb,
      edge,
      recommendation: gatedRecommendation,
      reason,
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
      source: `${market.source}|status=${market.status}|reason=${market.statusReason}${market.eventId ? `|eventId=${market.eventId}` : ""}`,
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
