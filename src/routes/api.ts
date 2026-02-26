import { Router } from "express";
import { prisma } from "../db/client.js";
import { runBacktest } from "../services/backtest.service.js";
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
