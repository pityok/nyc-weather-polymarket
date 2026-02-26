import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../db/client.js";
import { safeParse } from "../utils/json.js";

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
    {
      method: "simple",
      probsJson: { "20-25": 0.5, "25-30": 0.5 },
    },
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

describe("forecast runs API", () => {
  it("POST /forecast-runs creates run and returns 201", async () => {
    const res = await request(app).post("/forecast-runs").send(basePayload);

    expect(res.status).toBe(201);
    expect(res.body.runId).toBeTypeOf("string");
    expect(res.body.run.id).toBe(res.body.runId);
    expect(res.body.run.modelForecasts[0].rawResponse).toEqual({ answer: "ok" });
  });

  it("POST /forecast-runs returns 400 on invalid payload", async () => {
    const invalid = {
      ...basePayload,
      run: {
        ...basePayload.run,
        horizon: "invalid",
      },
    };

    const res = await request(app).post("/forecast-runs").send(invalid);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("GET /forecast-runs/:id returns created graph and 404 for missing", async () => {
    const created = await request(app).post("/forecast-runs").send(basePayload);

    const found = await request(app).get(`/forecast-runs/${created.body.runId}`);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(created.body.runId);
    expect(found.body.modelForecasts.length).toBe(1);
    expect(found.body.consensuses.length).toBe(1);
    expect(found.body.edgeSignals.length).toBe(1);

    const missing = await request(app).get("/forecast-runs/nonexistent-id");
    expect(missing.status).toBe(404);
  });

  it("safeParse returns fallback for broken json", () => {
    const parsed = safeParse<Record<string, number>>("{broken", { fallback: 1 });
    expect(parsed).toEqual({ fallback: 1 });
  });
});
