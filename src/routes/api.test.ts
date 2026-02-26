import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../db/client.js";

const basePayload = {
  run: {
    runTimeUtc: "2026-02-26T12:00:00.000Z",
    runTimeMsk: "2026-02-26T15:00:00.000Z",
    targetDate: "2026-02-27T00:00:00.000Z",
    horizon: "tomorrow",
  },
  modelForecasts: [
    {
      modelId: "gpt-5",
      modelName: "GPT 5",
      confidence: "high",
      rawResponse: { answer: "ok" },
      probsJson: { "20-25": 0.4, "25-30": 0.6 },
      sumBeforeNormalization: 1,
    },
  ],
  consensuses: [
    { method: "simple", probsJson: { "20-25": 0.5, "25-30": 0.5 } },
  ],
  edgeSignals: [
    {
      targetDate: "2026-02-27T00:00:00.000Z",
      rangeKey: "25-30",
      aiProb: 0.6,
      marketProb: 0.4,
      edge: 0.2,
      recommendation: "bet",
      reason: "Edge above threshold",
    },
  ],
  marketSnapshot: {
    targetDate: "2026-02-27T00:00:00.000Z",
    snapshotTimeUtc: "2026-02-26T12:00:00.000Z",
    snapshotType: "current",
    probsJson: { "20-25": 0.45, "25-30": 0.55 },
    source: "market-api",
  },
};

beforeEach(async () => {
  await prisma.edgeSignal.deleteMany();
  await prisma.consensus.deleteMany();
  await prisma.modelForecast.deleteMany();
  await prisma.marketSnapshot.deleteMany();
  await prisma.forecastRun.deleteMany();
});

describe("/api endpoints", () => {
  it("GET /api/summary returns aggregated response", async () => {
    await request(app).post("/forecast-runs").send(basePayload);

    const res = await request(app).get("/api/summary?date=2026-02-27");

    expect(res.status).toBe(200);
    expect(res.body.date).toBe("2026-02-27");
    expect(Array.isArray(res.body.forecasts)).toBe(true);
    expect(Array.isArray(res.body.consensus)).toBe(true);
    expect(Array.isArray(res.body.signals)).toBe(true);
  });

  it("GET /api/runs returns runs by date", async () => {
    await request(app).post("/forecast-runs").send(basePayload);
    const res = await request(app).get("/api/runs?date=2026-02-27");

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
  });

  it("GET /api/market returns market snapshots by type", async () => {
    await request(app).post("/forecast-runs").send(basePayload);
    const res = await request(app).get("/api/market?date=2026-02-27&type=current");

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("current");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("GET /api/signals and /api/backtest return data", async () => {
    await request(app).post("/forecast-runs").send(basePayload);

    const signals = await request(app).get("/api/signals?date=2026-02-27");
    expect(signals.status).toBe(200);
    expect(signals.body.items.length).toBe(1);

    const backtest = await request(app).get("/api/backtest?from=2026-02-27&to=2026-02-27");
    expect(backtest.status).toBe(200);
    expect(backtest.body.totalSignals).toBe(1);
  });
});
