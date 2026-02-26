import { Router } from "express";
import { createForecastRunWithData } from "../services/forecastRun.service.js";
import {
  getEdgeSignalsSummary,
  getForecastRunWithRelations,
  getLatestForecastRun,
  listForecastRuns,
} from "../db/forecastRepo.js";
import { createForecastRunPayloadSchema } from "../types/forecastRunPayload.js";
import { listForecastRunsQuerySchema, summaryQuerySchema } from "../types/analyticsQuery.js";
import { NotFoundError } from "../utils/errorHandler.js";
import { runForecastIngestionJob } from "../jobs/index.js";

const router = Router();

router.post("/forecast-runs", async (req, res, next) => {
  try {
    const payload = createForecastRunPayloadSchema.parse(req.body);
    const result = await createForecastRunWithData(payload);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/forecast-runs/trigger", async (_req, res, next) => {
  try {
    const result = await runForecastIngestionJob();
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/forecast-runs/latest", async (_req, res, next) => {
  try {
    const latest = await getLatestForecastRun();

    if (!latest) {
      throw new NotFoundError("No forecast runs found");
    }

    res.json(latest);
  } catch (error) {
    next(error);
  }
});

router.get("/forecast-runs/summary", async (req, res, next) => {
  try {
    const query = summaryQuerySchema.parse(req.query);
    const summary = await getEdgeSignalsSummary(query.runId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get("/forecast-runs", async (req, res, next) => {
  try {
    const query = listForecastRunsQuerySchema.parse(req.query);
    const result = await listForecastRuns({ limit: query.limit, offset: query.offset });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/forecast-runs/:id", async (req, res, next) => {
  try {
    const run = await getForecastRunWithRelations(req.params.id);

    if (!run) {
      throw new NotFoundError("Forecast run not found");
    }

    res.json(run);
  } catch (error) {
    next(error);
  }
});

export default router;
