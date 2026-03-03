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
  evolutionQuerySchema,
  modelQualityQuerySchema,
} from "../types/apiQuery.js";
import { CITY_REGISTRY } from "../config/cities.js";
import { getPolymarketNativeBins } from "../services/polymarketNative.service.js";

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
    "48-49": probs.r_48_49 ?? probs["48-49"] ?? 0,
    "50-51": probs.r_50_51 ?? probs["50-51"] ?? 0,
    "52-53": probs.r_52_53 ?? probs["52-53"] ?? 0,
    "54+": probs.ge_54 ?? probs["54+"] ?? 0,
  };
}

function formatMskDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const [d, t] = parts.split(" ");
  return { date: d, time: t, dateTime: `${d} ${t}` };
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

    const summary: Record<string, unknown> = {};

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

      const daySummary = summary[d] as {
        totalPredictions: number;
        byTime: Record<string, { predictions: unknown[] }>;
        marketData: unknown;
        marketByTime: Record<string, unknown>;
        marketUpdated: string | null;
      };

      const msk = formatMskDateTime(run.runTimeUtc);
      const slotKey = msk.dateTime;
      if (!daySummary.byTime[slotKey]) {
        daySummary.byTime[slotKey] = { predictions: [] };
      }

      for (const mf of run.modelForecasts) {
        const probs = toLegacyRanges(safeParse<Record<string, number>>(mf.probsJson, {}));
        const most = Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
        daySummary.byTime[slotKey].predictions.push({
          timestamp: run.createdAt.toISOString(),
          time_moscow: msk.time,
          request_date_moscow: msk.date,
          request_datetime_moscow: msk.dateTime,
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
        daySummary.totalPredictions += 1;
      }
    }

    for (const snap of snapshots) {
      // Never expose synthetic/degraded market values in dashboard-facing data
      const src = snap.source || "";
      if (src.startsWith("mock-") || src.includes("status=degraded") || src.includes("status=failed")) {
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

      const daySummary = summary[d] as {
        totalPredictions: number;
        byTime: Record<string, { predictions: unknown[] }>;
        marketData: unknown;
        marketByTime: Record<string, unknown>;
        marketUpdated: string | null;
      };

      const probs = toLegacyRanges(safeParse<Record<string, number>>(snap.probsJson, {}));
      const t = snap.snapshotTimeUtc.toISOString().slice(11, 16);
      daySummary.marketByTime[t] = probs;

      if (snap.snapshotType === "current") {
        daySummary.marketData = probs;
        daySummary.marketUpdated = snap.snapshotTimeUtc.toISOString();
      }

      if (snap.snapshotType === "fixed_1800_msk") {
        daySummary.marketByTime["18:00"] = probs;
      }
    }

    res.json({ lastUpdated: new Date().toISOString(), summary, rawData: [] });
  } catch (error) {
    next(error);
  }
});

router.get("/api/summary", async (req, res, next) => {
  try {
    const { date, cityId } = apiSummaryQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const [forecastRuns, marketCurrent, marketFixed, signals] = await Promise.all([
      prisma.forecastRun.findMany({
        where: { targetDate: { gte: start, lte: end }, cityId },
        include: { modelForecasts: true, consensuses: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.marketSnapshot.findFirst({
        where: { targetDate: { gte: start, lte: end }, snapshotType: "current", cityId },
        orderBy: { snapshotTimeUtc: "desc" },
      }),
      prisma.marketSnapshot.findFirst({
        where: { targetDate: { gte: start, lte: end }, snapshotType: "fixed_1800_msk", cityId },
        orderBy: { snapshotTimeUtc: "desc" },
      }),
      prisma.edgeSignal.findMany({ where: { targetDate: { gte: start, lte: end }, cityId } }),
    ]);

    const payload = {
      date,
      forecasts: forecastRuns.flatMap((r) => r.modelForecasts),
      consensus: forecastRuns.flatMap((r) => r.consensuses),
      market: {
        current: marketCurrent,
        fixed_1800_msk: marketFixed,
      },
      marketMeta: {
        currentSource: marketCurrent?.source ?? null,
        fixedSource: marketFixed?.source ?? null,
        currentSnapshotTime: marketCurrent?.snapshotTimeUtc ?? null,
        fixedSnapshotTime: marketFixed?.snapshotTimeUtc ?? null,
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
    const { date, cityId } = runsQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const runs = await prisma.forecastRun.findMany({
      where: { targetDate: { gte: start, lte: end }, cityId },
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
    const { date, type, cityId } = marketQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const items = await prisma.marketSnapshot.findMany({
      where: {
        targetDate: { gte: start, lte: end },
        snapshotType: type,
        cityId,
      },
      orderBy: { snapshotTimeUtc: "desc" },
    });

    res.json({ date, type, items });
  } catch (error) {
    next(error);
  }
});

router.get("/api/polymarket-native", async (req, res, next) => {
  try {
    const { date, cityId } = apiSummaryQuerySchema.parse(req.query);
    const result = await getPolymarketNativeBins(date, cityId);
    res.json({ date, cityId, ...result });
  } catch (error) {
    next(error);
  }
});

router.get("/api/signals", async (req, res, next) => {
  try {
    const { date, cityId } = signalsQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const items = await prisma.edgeSignal.findMany({
      where: { targetDate: { gte: start, lte: end }, cityId },
      orderBy: { edge: "desc" },
    });

    res.json({ date, items });
  } catch (error) {
    next(error);
  }
});

router.get("/api/backtest", async (req, res, next) => {
  try {
    const { from, to, cityId } = backtestQuerySchema.parse(req.query);
    const result = await runBacktest(from, to, cityId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * P2: Evolution endpoint — returns forecast versions for a target date,
 * ordered chronologically (T-2 → T-1 → T0).
 */
router.get("/api/evolution", async (req, res, next) => {
  try {
    const { date, cityId } = evolutionQuerySchema.parse(req.query);
    const { start, end } = dayBounds(date);

    const runs = await prisma.forecastRun.findMany({
      where: { targetDate: { gte: start, lte: end }, cityId },
      include: { consensuses: true },
      orderBy: { createdAt: "asc" },
    });

    const versions = runs.map((run, idx) => {
      const weighted = run.consensuses.find((c) => c.method === "weighted");
      const simple = run.consensuses.find((c) => c.method === "simple");
      const probs = safeParse<Record<string, number>>((weighted ?? simple)?.probsJson ?? "{}", {});
      const topEntry = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
      const topRange = topEntry?.[0] ?? null;
      const msk = formatMskDateTime(run.runTimeUtc);

      return {
        versionIndex: idx,
        runId: run.id,
        requestDatetimeUtc: run.runTimeUtc.toISOString(),
        requestDatetimeMsk: msk.dateTime,
        horizon: run.horizon,
        topRange,
        probs,
        method: weighted ? "weighted" : simple ? "simple" : "unknown",
      };
    });

    // Delta between consecutive versions (topRange changes and probability shifts)
    const deltas = versions.slice(1).map((v, i) => {
      const prev = versions[i];
      const probDelta: Record<string, number> = {};
      for (const k of Object.keys(v.probs)) {
        const cur = v.probs[k] ?? 0;
        const old = prev.probs[k] ?? 0;
        if (Math.abs(cur - old) > 0.001) {
          probDelta[k] = Number((cur - old).toFixed(4));
        }
      }
      return {
        fromRunId: prev.runId,
        toRunId: v.runId,
        topRangeChanged: prev.topRange !== v.topRange,
        topRangePrev: prev.topRange,
        topRangeCur: v.topRange,
        probDelta,
      };
    });

    res.json({ date, versions, deltas });
  } catch (error) {
    next(error);
  }
});

/**
 * P3: Model quality scoreboard — per-model 7d quality metrics and weights.
 */
router.get("/api/model-quality", async (req, res, next) => {
  try {
    const { windowDays, cityId } = modelQualityQuerySchema.parse(req.query);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    // Get the Monday of the week containing `since`
    const d = new Date(since);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    d.setUTCHours(0, 0, 0, 0);

    const weights = await prisma.weeklyModelWeight.findMany({
      where: { weekStartDate: { gte: d }, cityId },
      orderBy: [{ weekStartDate: "desc" }, { weight: "desc" }],
    });

    const models = weights.map((w) => ({
      modelId: w.modelId,
      weekStartDate: w.weekStartDate.toISOString().slice(0, 10),
      weight: w.weight,
      metrics: safeParse<Record<string, unknown>>(w.metricsJson, {}),
    }));

    res.json({
      windowDays,
      since: since.toISOString().slice(0, 10),
      models,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * P4: City registry — returns available cities.
 */
router.get("/api/cities", (_req, res) => {
  const cities = Object.values(CITY_REGISTRY).map(({ cityId, displayName, timezone }) => ({
    cityId,
    displayName,
    timezone,
  }));
  res.json({ cities });
});

export default router;
