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

describe("dashboard snapshot API", () => {
  it("GET /dashboard/snapshot returns 404 on empty DB", async () => {
    const res = await request(app).get("/dashboard/snapshot");
    expect(res.status).toBe(404);
  });

  it("GET /dashboard/snapshot returns run + summary + meta", async () => {
    const created = await request(app).post("/forecast-runs").send(basePayload);

    const res = await request(app).get("/dashboard/snapshot");

    expect(res.status).toBe(200);
    expect(res.body.run.id).toBe(created.body.runId);
    expect(res.body.summary.totalSignals).toBe(1);
    expect(res.body.meta.source).toBe("latest");
    expect(typeof res.body.meta.generatedAt).toBe("string");
  });

  it("GET /dashboard/snapshot?runId=... returns selected run", async () => {
    const first = await request(app).post("/forecast-runs").send(basePayload);
    const second = await request(app)
      .post("/forecast-runs")
      .send({
        ...basePayload,
        run: {
          ...basePayload.run,
          runTimeUtc: "2026-02-27T12:00:00.000Z",
          runTimeMsk: "2026-02-27T15:00:00.000Z",
        },
      });

    const res = await request(app).get(`/dashboard/snapshot?runId=${first.body.runId}`);

    expect(res.status).toBe(200);
    expect(res.body.run.id).toBe(first.body.runId);
    expect(res.body.run.id).not.toBe(second.body.runId);
    expect(res.body.meta.source).toBe("by-runId");
  });

  it("GET /dashboard/snapshot includeHistory works with limit", async () => {
    await request(app).post("/forecast-runs").send(basePayload);
    await request(app)
      .post("/forecast-runs")
      .send({
        ...basePayload,
        run: {
          ...basePayload.run,
          runTimeUtc: "2026-02-28T12:00:00.000Z",
          runTimeMsk: "2026-02-28T15:00:00.000Z",
        },
      });

    const res = await request(app).get("/dashboard/snapshot?includeHistory=true&historyLimit=1");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBe(1);
  });
});


describe("dashboard snapshot cityId", () => {
  it("isolates history and latest between nyc and london", async () => {
    const nyc = await request(app).post("/forecast-runs").send(basePayload);
    const london = await request(app)
      .post("/forecast-runs")
      .send({
        ...basePayload,
        run: { ...basePayload.run, cityId: "london" },
      });

    const resNyc = await request(app).get("/dashboard/snapshot?includeHistory=true&historyLimit=5&cityId=nyc");
    const resLondon = await request(app).get("/dashboard/snapshot?includeHistory=true&historyLimit=5&cityId=london");

    expect(resNyc.status).toBe(200);
    expect(resLondon.status).toBe(200);
    expect(resNyc.body.run.id).toBe(nyc.body.runId);
    expect(resLondon.body.run.id).toBe(london.body.runId);
    expect(resNyc.body.history.every((r: any) => r.id === nyc.body.runId)).toBe(true);
    expect(resLondon.body.history.every((r: any) => r.id === london.body.runId)).toBe(true);
  });
});
