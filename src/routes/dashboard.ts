import { Router } from "express";
import { dashboardSnapshotQuerySchema } from "../types/dashboardQuery.js";
import { buildDashboardSnapshot } from "../services/dashboard.service.js";
import { NotFoundError } from "../utils/errorHandler.js";

const router = Router();

router.get("/dashboard/snapshot", async (req, res, next) => {
  try {
    const query = dashboardSnapshotQuerySchema.parse(req.query);
    const snapshot = await buildDashboardSnapshot(query);

    if (!snapshot) {
      throw new NotFoundError("No forecast runs found");
    }

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

export default router;
