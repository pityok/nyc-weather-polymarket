import { Router } from "express";
import healthRouter from "./health.js";
import forecastRunsRouter from "./forecastRuns.js";
import dashboardRouter from "./dashboard.js";
import apiRouter from "./api.js";

const router = Router();

router.use(healthRouter);
router.use(forecastRunsRouter);
router.use(dashboardRouter);
router.use(apiRouter);

export default router;
