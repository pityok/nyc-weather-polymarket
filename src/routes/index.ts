import { Router } from "express";
import healthRouter from "./health.js";
import forecastRunsRouter from "./forecastRuns.js";
import dashboardRouter from "./dashboard.js";
import apiRouter from "./api.js";
import copytradeRouter from "./copytrade.js";

const router = Router();

router.use(healthRouter);
router.use(forecastRunsRouter);
router.use(dashboardRouter);
router.use(apiRouter);
router.use(copytradeRouter);

export default router;
