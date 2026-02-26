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

  let hit = 0;
  let considered = 0;
  let brierSum = 0;
  const calibrationBins = Array.from({ length: 10 }, (_, i) => ({
    bin: `${i * 10}-${i * 10 + 9}`,
    count: 0,
    meanProb: 0,
    hitRate: 0,
  }));

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
  }

  for (const b of calibrationBins) {
    if (!b.count) continue;
    b.meanProb = Number((b.meanProb / b.count).toFixed(2));
    b.hitRate = Number(((b.hitRate / b.count) * 100).toFixed(2));
  }

  const bets = signals.filter((s) => s.recommendation === "bet");
  const roi = bets.length ? bets.reduce((sum, s) => sum + s.edge, 0) / bets.length : 0;

  // Weekly model weights (simple proxy: share by model forecast count)
  const byWeekModel = new Map<string, Map<string, number>>();
  for (const c of consensuses) {
    const week = weekStartUTC(c.forecastRun.targetDate).toISOString();
    if (!byWeekModel.has(week)) byWeekModel.set(week, new Map());
    const m = byWeekModel.get(week)!;
    for (const mf of c.forecastRun.modelForecasts) {
      m.set(mf.modelId, (m.get(mf.modelId) ?? 0) + 1);
    }
  }

  for (const [week, m] of byWeekModel) {
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [modelId, count] of m) {
      const weight = Number(((count / total) * 100).toFixed(4));
      await prisma.weeklyModelWeight.upsert({
        where: { weekStartDate_modelId: { weekStartDate: new Date(week), modelId } },
        create: {
          weekStartDate: new Date(week),
          modelId,
          weight,
          metricsJson: safeStringify({ count }),
        },
        update: {
          weight,
          metricsJson: safeStringify({ count }),
        },
      });
    }
  }

  return {
    from,
    to,
    hitRateTopRange: considered ? Number(((hit / considered) * 100).toFixed(2)) : 0,
    brierScore: considered ? Number((brierSum / considered).toFixed(6)) : 0,
    calibrationByBins: calibrationBins,
    simulatedRoiPct: Number(roi.toFixed(4)),
    totalSignals: signals.length,
    totalBets: bets.length,
  };
}
