import { prisma } from "../db/client.js";
import { safeParse, safeStringify } from "../utils/json.js";

function toDateStart(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function toDateEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59.999Z`);
}

function weekStartUTC(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

type ModelQualityStats = {
  n: number;
  hits: number;
  brierSum: number;
  calibrationSum: number;
};

export async function runBacktest(from: string, to: string) {
  const fromDate = toDateStart(from);
  const toDate = toDateEnd(to);

  const [signals, outcomes, consensuses] = await Promise.all([
    prisma.edgeSignal.findMany({ where: { targetDate: { gte: fromDate, lte: toDate } } }),
    prisma.actualOutcome.findMany({ where: { targetDate: { gte: fromDate, lte: toDate } } }),
    prisma.consensus.findMany({
      where: { forecastRun: { targetDate: { gte: fromDate, lte: toDate } } },
      include: { forecastRun: { include: { modelForecasts: true } } },
    }),
  ]);

  const outcomeByDate = new Map(outcomes.map((o) => [o.targetDate.toISOString().slice(0, 10), o]));

  // Aggregate consensus-level metrics (simple)
  let hit = 0;
  let considered = 0;
  let brierSum = 0;
  const calibrationBins = Array.from({ length: 10 }, (_, i) => ({
    bin: `${i * 10}-${i * 10 + 9}`,
    count: 0,
    meanProb: 0,
    hitRate: 0,
  }));

  // Per-model quality stats (for P3 weighted comparison + WeeklyModelWeight)
  const perModelStats = new Map<string, ModelQualityStats>();
  // Per-week per-model quality stats
  const byWeekModel = new Map<string, Map<string, ModelQualityStats>>();

  for (const c of consensuses) {
    const dist = safeParse<Record<string, number>>(c.probsJson, {});
    const top = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;
    const [topKey, topProb] = top;

    const dateKey = c.forecastRun.targetDate.toISOString().slice(0, 10);
    const outcome = outcomeByDate.get(dateKey);
    if (!outcome) continue;

    considered += 1;
    const isHit = outcome.winningRangeKey === topKey;
    if (isHit) hit += 1;

    const p = Number(topProb) / 100;
    const y = isHit ? 1 : 0;
    brierSum += (p - y) ** 2;

    const bi = Math.min(9, Math.max(0, Math.floor(Number(topProb) / 10)));
    const bin = calibrationBins[bi];
    bin.count += 1;
    bin.meanProb += Number(topProb);
    bin.hitRate += y;

    // Per-model quality from individual model forecasts
    const week = weekStartUTC(c.forecastRun.targetDate).toISOString();
    if (!byWeekModel.has(week)) byWeekModel.set(week, new Map());
    const weekMap = byWeekModel.get(week)!;

    for (const mf of c.forecastRun.modelForecasts) {
      const mfProbs = safeParse<Record<string, number>>(mf.probsJson, {});
      const mfTop = Object.entries(mfProbs).sort((a, b) => b[1] - a[1])[0];
      if (!mfTop) continue;

      const [mfTopKey, mfTopProb] = mfTop;
      const mfIsHit = mfTopKey === outcome.winningRangeKey;
      const mfP = mfTopProb / 100;
      const mfY = mfIsHit ? 1 : 0;

      // Aggregate per-model across all periods
      const globalStats = perModelStats.get(mf.modelId) ?? { n: 0, hits: 0, brierSum: 0, calibrationSum: 0 };
      globalStats.n += 1;
      if (mfIsHit) globalStats.hits += 1;
      globalStats.brierSum += (mfP - mfY) ** 2;
      globalStats.calibrationSum += Math.abs(mfP - mfY);
      perModelStats.set(mf.modelId, globalStats);

      // Per-week stats
      const weekStats = weekMap.get(mf.modelId) ?? { n: 0, hits: 0, brierSum: 0, calibrationSum: 0 };
      weekStats.n += 1;
      if (mfIsHit) weekStats.hits += 1;
      weekStats.brierSum += (mfP - mfY) ** 2;
      weekStats.calibrationSum += Math.abs(mfP - mfY);
      weekMap.set(mf.modelId, weekStats);
    }
  }

  for (const b of calibrationBins) {
    if (!b.count) continue;
    b.meanProb = Number((b.meanProb / b.count).toFixed(2));
    b.hitRate = Number(((b.hitRate / b.count) * 100).toFixed(2));
  }

  const bets = signals.filter((s) => s.recommendation === "bet");
  const roi = bets.length ? bets.reduce((sum, s) => sum + s.edge, 0) / bets.length : 0;

  // Save real quality-based weights to WeeklyModelWeight
  for (const [week, weekMap] of byWeekModel) {
    // Compute quality scores for this week
    const scores: Array<{ modelId: string; score: number; stats: ModelQualityStats }> = [];
    for (const [modelId, s] of weekMap) {
      const hitRate = s.n ? s.hits / s.n : 0;
      const brier = s.n ? s.brierSum / s.n : 1;
      const cal = s.n ? s.calibrationSum / s.n : 1;
      const score = hitRate * 0.5 + (1 - brier) * 0.3 + (1 - cal) * 0.2;
      scores.push({ modelId, score: Math.max(0, score), stats: s });
    }
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0) || 1;

    for (const { modelId, score, stats } of scores) {
      const weight = Number(((score / totalScore) * 100).toFixed(4));
      const hitRate = stats.n ? stats.hits / stats.n : 0;
      const brierScore = stats.n ? stats.brierSum / stats.n : 1;
      const calibrationError = stats.n ? stats.calibrationSum / stats.n : 1;

      await prisma.weeklyModelWeight.upsert({
        where: { weekStartDate_modelId: { weekStartDate: new Date(week), modelId } },
        create: {
          weekStartDate: new Date(week),
          modelId,
          weight,
          metricsJson: safeStringify({ hitRate, brierScore, calibrationError, n: stats.n }),
        },
        update: {
          weight,
          metricsJson: safeStringify({ hitRate, brierScore, calibrationError, n: stats.n }),
        },
      });
    }
  }

  // Per-model summary for backtest output
  const modelSummary = Array.from(perModelStats.entries()).map(([modelId, s]) => ({
    modelId,
    n: s.n,
    hitRate: s.n ? Number(((s.hits / s.n) * 100).toFixed(2)) : 0,
    brierScore: s.n ? Number((s.brierSum / s.n).toFixed(6)) : 1,
    calibrationError: s.n ? Number((s.calibrationSum / s.n).toFixed(4)) : 1,
  }));

  return {
    from,
    to,
    hitRateTopRange: considered ? Number(((hit / considered) * 100).toFixed(2)) : 0,
    brierScore: considered ? Number((brierSum / considered).toFixed(6)) : 0,
    calibrationByBins: calibrationBins,
    simulatedRoiPct: Number(roi.toFixed(4)),
    totalSignals: signals.length,
    totalBets: bets.length,
    modelSummary,
  };
}
