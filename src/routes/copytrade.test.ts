import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { resetCopytradeState } from "../services/copytrade.service.js";

afterEach(() => {
  resetCopytradeState();
  vi.restoreAllMocks();
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

describe("POST /api/copytrade/control/refresh", () => {
  it("hydrates copytrade state from live Polymarket activity and positions payloads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/activity?")) {
        return new Response(JSON.stringify([
          {
            name: "Lex-tang",
            type: "TRADE",
            conditionId: "cond-live-1",
            title: "Will the highest temperature in New York City be between 54-55°F on March 21?",
            eventSlug: "highest-temperature-in-nyc-on-march-21-2026",
            outcome: "Yes",
            side: "BUY",
            size: 120,
            usdcSize: 30,
            price: 0.25,
            timestamp: Math.floor(Date.now() / 1000) - 120,
            transactionHash: "0xabc",
          },
          {
            name: "Lex-tang",
            type: "TRADE",
            conditionId: "cond-live-1",
            title: "Will the highest temperature in New York City be between 54-55°F on March 21?",
            eventSlug: "highest-temperature-in-nyc-on-march-21-2026",
            outcome: "Yes",
            side: "BUY",
            size: 30,
            usdcSize: 9,
            price: 0.3,
            timestamp: Math.floor(Date.now() / 1000) - 100,
            transactionHash: "0xdef",
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/positions?")) {
        return new Response(JSON.stringify([
          {
            conditionId: "cond-live-1",
            title: "Will the highest temperature in New York City be between 54-55°F on March 21?",
            outcome: "Yes",
            size: 8,
            avgPrice: 0.2,
            curPrice: 0.31,
            currentValue: 2.48,
            cashPnl: 0.88,
            realizedPnl: 0,
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });

    const refreshRes = await request(app).post("/api/copytrade/control/refresh");

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();

    const snapshot = await request(app).get("/api/copytrade/snapshot");
    expect(snapshot.body.leader.name).toBe("Lex-tang");
    expect(snapshot.body.positions[0]).toMatchObject({
      conditionId: "cond-live-1",
      market: "NYC 54-55°F",
      outcome: "YES",
      lexNetShares: 150,
      myCurrentShares: 8,
      myTargetShares: 15,
      deltaShares: 7,
      action: "BUY",
      status: "READY",
    });
    expect(snapshot.body.leaderEvents[0].group).toBe("cond-live-1::YES");
  });
});
