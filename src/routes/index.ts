import { Router } from "express";
import healthRouter from "./health.js";
import forecastRunsRouter from "./forecastRuns.js";

const router = Router();

router.use(healthRouter);
router.use(forecastRunsRouter);

export default router;
