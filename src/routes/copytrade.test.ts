import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { resetCopytradeState } from "../services/copytrade.service.js";

afterEach(() => {
  resetCopytradeState();
});

describe("GET /api/copytrade/status", () => {
  it("returns a consistent latest decision for the lead rebalance row", async () => {
    const res = await request(app).get("/api/copytrade/status");

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("dry-run");
    expect(res.body.latestDecision).toMatchObject({
      market: "NYC 61-62F",
      outcome: "YES",
      action: "BUY",
      status: "READY",
    });
    expect(res.body.latestDecision.reason).toContain("deltaNotional");
    expect(res.body.follower.freeBudget).toBe(32);
  });
});

describe("GET /api/copytrade/rebalance-queue", () => {
  it("returns evaluated rows with canonical target-position fields", async () => {
    const res = await request(app).get("/api/copytrade/rebalance-queue");

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      market: "NYC 61-62F",
      outcome: "YES",
      lexNetShares: 132,
      myCurrentShares: 8.1,
      myTargetShares: 13.2,
      deltaShares: 5.1,
      action: "BUY",
      status: "READY",
    });

    expect(res.body.items[1].status).toBe("WAITING");
    expect(res.body.items[1].reason).toContain("minTradeNotionalUsd");
  });
});

describe("POST /api/copytrade/config", () => {
  it("updates config without breaking snapshot generation", async () => {
    const res = await request(app)
      .post("/api/copytrade/config")
      .send({ minTradeNotionalUsd: 3.5, maxSignalAgeSec: 240 });

    expect(res.status).toBe(200);
    expect(res.body.config.minTradeNotionalUsd).toBe(3.5);
    expect(res.body.config.maxSignalAgeSec).toBe(240);

    const snapshot = await request(app).get("/api/copytrade/snapshot");
    expect(snapshot.body.config.minTradeNotionalUsd).toBe(3.5);
    expect(snapshot.body.stats.pendingRebalances).toBeGreaterThan(0);
  });
});

describe("POST /api/copytrade/control/pause", () => {
  it("pauses and resumes the runtime through control endpoints", async () => {
    const pauseRes = await request(app)
      .post("/api/copytrade/control/pause")
      .send({ reason: "manual review" });

    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body).toMatchObject({
      mode: "paused",
      runtime: "paused",
      pausedReason: "manual review",
    });

    const resumeRes = await request(app).post("/api/copytrade/control/resume");

    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body).toMatchObject({
      mode: "dry-run",
      runtime: "running",
      pausedReason: null,
    });
  });
});
