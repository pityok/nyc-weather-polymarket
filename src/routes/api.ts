import { Router } from "express";
import { prisma } from "../db/client.js";
import { runBacktest } from "../services/backtest.service.js";
import { safeParse } from "../utils/json.js";
import {
  apiSummaryResponseSchema,
  backtestQuerySchema,
  marketQuerySchema,
  runsQuerySchema,
  signalsQuerySchema,
  apiSummaryQuerySchema,
} from "../types/apiQuery.js";

const router = Router();

function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  return { start, end };
}

function toLegacyRanges(probs: Record<string, number>) {
  return {
    "33-": probs.le_33 ?? probs["33-"] ?? 0,
    "34-35": probs.r_34_35 ?? probs["34-35"] ?? 0,
    "36-37": probs.r_36_37 ?? probs["36-37"] ?? 0,
    "38-39": probs.r_38_39 ?? probs["38-39"] ?? 0,
    "40-41": probs.r_40_41 ?? probs["40-41"] ?? 0,
    "42-43": probs.r_42_43 ?? probs["42-43"] ?? 0,
    "44-45": probs.r_44_45 ?? probs["44-45"] ?? 0,
    "46-47": probs.r_46_47 ?? probs["46-47"] ?? 0,
    "48+": probs.ge_48 ?? probs["48+"] ?? 0,
  };
}

router.get("/data.json", async (_req, res, next) => {
  try {
    const [runs, snapshots] = await Promise.all([
      prisma.forecastRun.findMany({
        orderBy: { createdAt: "asc" },
        include: { modelForecasts: true },
      }),
      prisma.marketSnapshot.findMany({ orderBy: { snapshotTimeUtc: "asc" } }),
    ]);

    const summary: Record<string, any> = {};

    for (const run of runs) {
      const d = run.targetDate.toISOString().slice(0, 10);
      if (!summary[d]) {
        summary[d] = {
          totalPredictions: 0,
          byTime: {},
          marketData: null,
          marketByTime: {},
          marketUpdated: null,
        };
      }

      const timeMsk = new Date(run.runTimeMsk).toISOString().slice(11, 16);
      if (!summary[d].byTime[timeMsk]) {
        summary[d].byTime[timeMsk] = { predictions: [] };
      }

      for (const mf of run.modelForecasts) {
        const probs = toLegacyRanges(safeParse<Record<string, number>>(mf.probsJson, {}));
        const most = Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
        summary[d].byTime[timeMsk].predictions.push({
          timestamp: run.createdAt.toISOString(),
          time_moscow: timeMsk,
          targetDate: d,
          model: mf.modelName,
          modelId: mf.modelId,
          source: "openrouter",
          probabilities: probs,
          mostLikely: most,
          confidence: mf.confidence,
          factors: [],
          comment: "",
        });
        summary[d].totalPredictions += 1;
      }
    }

    for (const snap of snapshots) {
      // Never expose mock market values in dashboard-facing data
      if ((snap.source || "").startsWith("mock-")) {
        continue;
      }

      const d = snap.targetDate.toISOString().slice(0, 10);
      if (!summary[d]) {
        summary[d] = {
          totalPredictions: 0,
          byTime: {},
          marketData: null,
          marketByTime: {},
          marketUpdated: null,
        };
      }

      const probs = toLegacyRanges(safeParse<Record<string, number>>(snap.probsJson, {}));
      const t = snap.snapshotTimeUtc.toISOString().slice(11, 16);
      summary[d].marketByTime[t] = probs;

      if (snap.snapshotType === "current") {
        summary[d].marketData = probs;
        summary[d].marketUpdated = snap.snapshotTimeUtc.toISOString();
      }

      if (snap.snapshotType === "fixed_1800_msk") {
        summary[d].marketByTime["18:00"] = probs;
      }
    }

    res.json({ lastUpdated: new Date().toISOString(), summary, rawData: [] });
  } catch (error) {
    next(error);
  }
});

router.get("/api/summary", async (req, res, next) => {
  try {
    const { date } = apiSummaryQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const [forecastRuns, marketCurrent, marketFixed, signals] = await Promise.all([
      prisma.forecastRun.findMany({
        where: { targetDate: { gte: start, lte: end } },
        include: { modelForecasts: true, consensuses: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.marketSnapshot.findFirst({
        where: { targetDate: { gte: start, lte: end }, snapshotType: "current" },
        orderBy: { snapshotTimeUtc: "desc" },
      }),
      prisma.marketSnapshot.findFirst({
        where: { targetDate: { gte: start, lte: end }, snapshotType: "fixed_1800_msk" },
        orderBy: { snapshotTimeUtc: "desc" },
      }),
      prisma.edgeSignal.findMany({ where: { targetDate: { gte: start, lte: end } } }),
    ]);

    const payload = {
      date,
      forecasts: forecastRuns.flatMap((r) => r.modelForecasts),
      consensus: forecastRuns.flatMap((r) => r.consensuses),
      market: {
        current: marketCurrent,
        fixed_1800_msk: marketFixed,
      },
      signals,
    };

    res.json(apiSummaryResponseSchema.parse(payload));
  } catch (error) {
    next(error);
  }
});

router.get("/api/runs", async (req, res, next) => {
  try {
    const { date } = runsQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const runs = await prisma.forecastRun.findMany({
      where: { targetDate: { gte: start, lte: end } },
      include: {
        _count: {
          select: { modelForecasts: true, consensuses: true, edgeSignals: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ date, items: runs });
  } catch (error) {
    next(error);
  }
});

router.get("/api/market", async (req, res, next) => {
  try {
    const { date, type } = marketQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const items = await prisma.marketSnapshot.findMany({
      where: {
        targetDate: { gte: start, lte: end },
        snapshotType: type,
      },
      orderBy: { snapshotTimeUtc: "desc" },
    });

    res.json({ date, type, items });
  } catch (error) {
    next(error);
  }
});

router.get("/api/signals", async (req, res, next) => {
  try {
    const { date } = signalsQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const items = await prisma.edgeSignal.findMany({
      where: { targetDate: { gte: start, lte: end } },
      orderBy: { edge: "desc" },
    });

    res.json({ date, items });
  } catch (error) {
    next(error);
  }
});

router.get("/api/backtest", async (req, res, next) => {
  try {
    const { from, to } = backtestQuerySchema.parse(req.query);
    const result = await runBacktest(from, to);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
