import { Router, Request, Response } from "express";
import { prisma } from "../db/client.js";
import { getMetrics } from "../utils/metrics.js";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * Detailed health + in-memory observability metrics.
 * Reports per-service: call count, error count, retry count, avg latency, error rate.
 * Also checks DB connectivity.
 */
router.get("/health/metrics", async (_req: Request, res: Response) => {
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const metrics = getMetrics();
  const anyDegraded = Object.values(metrics).some((m) => m.errorRate > 0.5);

  res.status(dbOk ? 200 : 503).json({
    ok: dbOk && !anyDegraded,
    db: { ok: dbOk, error: dbError },
    services: metrics,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
