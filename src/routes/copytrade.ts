import { Router } from "express";
import {
  getCopytradeMode,
  getCopytradeSnapshot,
  getCopytradeState,
  pauseCopytrade,
  refreshCopytradeState,
  resumeCopytrade,
  setCopytradeMode,
  updateCopytradeConfig,
} from "../services/copytrade.service.js";

const router = Router();

router.get("/api/copytrade/health", (_req, res) => {
  const snapshot = getCopytradeSnapshot();
  res.json({
    ok: snapshot.bot.health !== "error",
    mode: snapshot.mode,
    runtime: snapshot.bot.runtime,
    health: snapshot.bot.health,
    lastSyncAt: snapshot.bot.lastSyncAt,
    lagSec: snapshot.bot.lagSec,
  });
});

router.get("/api/copytrade/status", (_req, res) => {
  const snapshot = getCopytradeSnapshot();
  res.json({
    mode: snapshot.mode,
    bot: snapshot.bot,
    leader: snapshot.leader,
    follower: snapshot.follower,
    stats: snapshot.stats,
    latestDecision: snapshot.latestDecision,
    systemStates: snapshot.systemStates,
    riskBars: snapshot.riskBars,
  });
});

router.get("/api/copytrade/snapshot", (_req, res) => {
  res.json(getCopytradeSnapshot());
});

router.get("/api/copytrade/raw-state", (_req, res) => {
  res.json(getCopytradeState());
});

router.get("/api/copytrade/config", (_req, res) => {
  res.json(getCopytradeSnapshot().config);
});

router.post("/api/copytrade/config", (req, res, next) => {
  try {
    const snapshot = updateCopytradeConfig(req.body);
    res.json({ config: snapshot.config, updatedAt: snapshot.bot.lastSyncAt });
  } catch (error) {
    next(error);
  }
});

router.get("/api/copytrade/leader/events", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().leaderEvents });
});

router.get("/api/copytrade/leader/aggregated", (_req, res) => {
  const snapshot = getCopytradeSnapshot();
  res.json({ items: snapshot.targetState });
});

router.get("/api/copytrade/markets", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().markets });
});

router.get("/api/copytrade/positions", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().positions });
});

router.get("/api/copytrade/rebalance-queue", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().rebalanceQueue });
});

router.get("/api/copytrade/target-state", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().targetState });
});

router.get("/api/copytrade/aggregation-state", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().aggregationState });
});

router.get("/api/copytrade/decision-trace", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().decisionTrace });
});

router.get("/api/copytrade/decision-log", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().decisionLog });
});

router.get("/api/copytrade/execution-log", (_req, res) => {
  res.json({ items: getCopytradeSnapshot().executionLog });
});

router.post("/api/copytrade/mode", (req, res, next) => {
  try {
    const snapshot = setCopytradeMode(req.body);
    res.json({ mode: snapshot.mode, runtime: snapshot.bot.runtime, pausedReason: snapshot.bot.pausedReason });
  } catch (error) {
    next(error);
  }
});

router.post("/api/copytrade/control/pause", (req, res, next) => {
  try {
    const snapshot = pauseCopytrade(req.body);
    res.json({ mode: snapshot.mode, runtime: snapshot.bot.runtime, pausedReason: snapshot.bot.pausedReason });
  } catch (error) {
    next(error);
  }
});

router.post("/api/copytrade/control/resume", (_req, res) => {
  const snapshot = resumeCopytrade();
  res.json({ mode: snapshot.mode, runtime: snapshot.bot.runtime, pausedReason: snapshot.bot.pausedReason });
});

router.post("/api/copytrade/control/refresh", async (_req, res, next) => {
  try {
    const snapshot = await refreshCopytradeState();
    res.json({
      ok: snapshot.bot.health !== "error",
      lastSyncAt: snapshot.bot.lastSyncAt,
      leaderEvents: snapshot.leaderEvents.length,
      positions: snapshot.positions.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/api/copytrade/mode", (_req, res) => {
  res.json({ mode: getCopytradeMode() });
});

export default router;
