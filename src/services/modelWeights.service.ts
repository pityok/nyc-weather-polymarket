import { prisma } from "../db/client.js";
import { safeParse } from "../utils/json.js";

export type ModelWeight = {
  modelId: string;
  weight: number;
  metrics: {
    hitRate: number;
    brierScore: number;
    calibrationError: number;
    n: number;
  };
};

export type ModelWeightsResult =
  | { ok: true; weights: Map<string, number>; models: ModelWeight[] }
  | { ok: false; reason: string; weights: null };

const MIN_OUTCOMES_FOR_WEIGHTS = 3;

/**
 * Compute per-model quality weights from the last 7 days.
 *
 * Score formula (higher = better model):
 *   score = hitRate * 0.5 + (1 - brierScore) * 0.3 + (1 - calibrationError) * 0.2
 *
 * Returns ok=false with explicit reason when there are not enough outcomes.
 */
export async function computeModelWeights7d(now = new Date(), cityId = "nyc"): Promise<ModelWeightsResult> {
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const outcomes = await prisma.actualOutcome.findMany({
    where: { targetDate: { gte: windowStart }, cityId },
    select: { targetDate: true, winningRangeKey: true },
  });

  if (outcomes.length < MIN_OUTCOMES_FOR_WEIGHTS) {
    return {
      ok: false,
      reason: `insufficient_outcomes: found ${outcomes.length} in last 7d, need >= ${MIN_OUTCOMES_FOR_WEIGHTS}`,
      weights: null,
    };
  }

  const outcomeByDate = new Map(
    outcomes.map((o) => [o.targetDate.toISOString().slice(0, 10), o.winningRangeKey]),
  );

  const runs = await prisma.forecastRun.findMany({
    where: { targetDate: { gte: windowStart }, cityId },
    select: {
      targetDate: true,
      modelForecasts: {
        select: { modelId: true, probsJson: true },
      },
    },
  });

  type ModelStats = {
    n: number;
    hits: number;
    brierSum: number;
    calibrationSum: number;
  };

  const statsMap = new Map<string, ModelStats>();

  for (const run of runs) {
    const dateKey = run.targetDate.toISOString().slice(0, 10);
    const winningKey = outcomeByDate.get(dateKey);
    if (!winningKey) continue;

    for (const mf of run.modelForecasts) {
      const probs = safeParse<Record<string, number>>(mf.probsJson, {});
      const topEntry = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
      if (!topEntry) continue;

      const [topKey, topProb] = topEntry;
      const isHit = topKey === winningKey;
      const p = topProb / 100;
      const y = isHit ? 1 : 0;

      const s = statsMap.get(mf.modelId) ?? { n: 0, hits: 0, brierSum: 0, calibrationSum: 0 };
      s.n += 1;
      if (isHit) s.hits += 1;
      s.brierSum += (p - y) ** 2;
      s.calibrationSum += Math.abs(p - y);
      statsMap.set(mf.modelId, s);
    }
  }

  if (statsMap.size === 0) {
    return {
      ok: false,
      reason: "no_model_forecasts_with_outcomes_in_7d",
      weights: null,
    };
  }

  const models: ModelWeight[] = [];
  for (const [modelId, s] of statsMap) {
    const hitRate = s.n ? s.hits / s.n : 0;
    const brierScore = s.n ? s.brierSum / s.n : 1;
    const calibrationError = s.n ? s.calibrationSum / s.n : 1;
    const score = hitRate * 0.5 + (1 - brierScore) * 0.3 + (1 - calibrationError) * 0.2;
    models.push({
      modelId,
      weight: Math.max(0, score),
      metrics: {
        hitRate: Number(hitRate.toFixed(4)),
        brierScore: Number(brierScore.toFixed(6)),
        calibrationError: Number(calibrationError.toFixed(4)),
        n: s.n,
      },
    });
  }

  const totalScore = models.reduce((sum, m) => sum + m.weight, 0);
  if (totalScore <= 0) {
    const eq = 1 / models.length;
    models.forEach((m) => (m.weight = eq));
  } else {
    models.forEach((m) => (m.weight = m.weight / totalScore));
  }

  const weights = new Map(models.map((m) => [m.modelId, m.weight]));
  return { ok: true, weights, models };
}
