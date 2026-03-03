import { llmAdapters } from "../adapters/index.js";
import { config } from "../config/index.js";
import { getMarketProbabilities } from "../market/polymarket.js";
import { createForecastRunPayloadSchema, type CreateForecastRunPayload } from "../types/forecastRunPayload.js";
import { normalizeDistribution, RANGES, type Distribution, type RangeKey } from "../types/ranges.js";
import { createForecastRunWithData } from "./forecastRun.service.js";
import { computeEdgeRecommendation } from "./edge.service.js";
import { computeModelWeights7d } from "./modelWeights.service.js";
import { fetchWithRetry, RETRY_OPEN_METEO } from "../utils/fetchWithRetry.js";
import { targetDateForHorizon, parseDateUTC } from "../utils/timeNY.js";
import { getDefaultCity } from "../config/cities.js";
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

async function getBaselineDistribution(targetDate: string, cityId = "nyc"): Promise<Distribution> {
  const city = getDefaultCity(cityId);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(city.coords.lat));
  url.searchParams.set("longitude", String(city.coords.lon));
  url.searchParams.set("daily", "temperature_2m_max");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", city.timezone);
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
  cityId = config.defaultCityId,
): Promise<CreateForecastRunPayload> {
  // Use NY timezone as source of truth for targetDate/horizon (fixes UTC-based bug)
  const targetDate = targetDateForHorizon(horizon, now);
  const target = parseDateUTC(targetDate);

  let modelForecasts: CreateForecastRunPayload["modelForecasts"] = [];
  let simple: Distribution;
  let weighted: Distribution;
  type WeightsResult = Awaited<ReturnType<typeof computeModelWeights7d>>;
  let weightsResult: WeightsResult;

  if (config.baselineOnly) {
    // Baseline mode: Open-Meteo only, no LLM. Run weights + market in parallel.
    const [baseline, wr] = await Promise.all([
      getBaselineDistribution(targetDate, cityId),
      computeModelWeights7d(now, cityId),
    ]);
    weightsResult = wr;
    simple = baseline;
    weighted = baseline;
    modelForecasts = [
      {
        modelId: "baseline/open-meteo",
        modelName: "Baseline Open-Meteo",
        confidence: "medium",
        rawResponse: { targetDate, mode: "baseline_only", cityId },
        probsJson: baseline,
        sumBeforeNormalization: 100,
      },
    ];
  } else {
    // LLM mode: compute weights and forecasts in parallel
    const [settled, wr] = await Promise.all([
      Promise.allSettled(
        llmAdapters.map((adapter) =>
          adapter.getForecast({
            targetDate,
            location: "NYC LaGuardia",
            context: { note: "Do not use market probabilities", cityId },
          }),
        ),
      ),
      computeModelWeights7d(now, cityId),
    ]);
    weightsResult = wr;

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
    if (weightsResult.ok) {
      weighted = weightedDistribution(modelDists, weightsResult.weights);
      const weightLog = weightsResult.models.map((m) => `${m.modelId}:${m.weight.toFixed(4)}`).join(",");
      console.info(`[pipeline] weighted consensus via 7d quality weights: ${weightLog}`);
    } else {
      weighted = simple;
      console.warn(`[pipeline] weighted consensus fallback: ${weightsResult.reason}`);
    }
  }

  const market = await getMarketProbabilities(targetDate, "current", cityId);
  const marketDist = market.distribution;

  // P3 quality gate: if QUALITY_GATE_REQUIRED=true and quality data insufficient → no_bet
  const qualityGatePassed = !config.qualityGateRequired || weightsResult.ok;
  const qualityGateReason = weightsResult.ok ? null : weightsResult.reason;

  const edgeSignals = RANGES.map((rangeKey) => {
    const aiProb = simple[rangeKey];
    const marketProb = marketDist[rangeKey];
    const { edge, recommendation } = computeEdgeRecommendation(aiProb, marketProb);

    // Gate 1: degraded/failed market => force no_bet
    // Gate 2: quality gate (P3) — only active if QUALITY_GATE_REQUIRED=true
    const gatedRecommendation =
      market.status !== "healthy"
        ? "no_bet"
        : !qualityGatePassed
          ? "no_bet"
          : recommendation;

    const reason =
      market.status !== "healthy"
        ? `Market ${market.status}: ${market.statusReason}`
        : !qualityGatePassed
          ? `quality_gate_not_met: ${qualityGateReason}`
          : recommendation === "bet"
            ? "Edge & probability above thresholds"
            : "Below thresholds";

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
      cityId,
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
      cityId,
    },
  };
}

export async function runForecastPipeline(
  horizon: ForecastHorizon = "tomorrow",
  cityId = config.defaultCityId,
): Promise<PipelineResult> {
  const started = Date.now();

  try {
    const now = new Date();
    const payload = createForecastRunPayloadSchema.parse(await gatherForecastPayload(horizon, now, cityId));
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
