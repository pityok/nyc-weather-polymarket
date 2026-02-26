import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../db/client.js";
import { safeParse } from "../utils/json.js";
import * as jobs from "../jobs/index.js";
import * as pipelineService from "../services/forecastPipeline.service.js";

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
  vi.restoreAllMocks();
  jobs.__resetForecastJobLock();

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

  it("POST /forecast-runs/trigger returns 202 and runId", async () => {
    vi.spyOn(jobs, "runForecastIngestionJob").mockResolvedValue({
      status: "started",
      runId: "run_mock_1",
      durationMs: 10,
      counts: { modelForecasts: 1, consensuses: 1, edgeSignals: 1 },
    });

    const res = await request(app).post("/forecast-runs/trigger").send({});

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("started");
    expect(res.body.runId).toBe("run_mock_1");
  });

  it("parallel trigger returns started then skipped", async () => {
    let running = false;
    vi.spyOn(jobs, "runForecastIngestionJob").mockImplementation(async () => {
      if (running) {
        return { status: "skipped", reason: "already running" } as const;
      }

      running = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
      running = false;
      return {
        status: "started",
        runId: "run_parallel",
        durationMs: 50,
        counts: { modelForecasts: 1, consensuses: 1, edgeSignals: 1 },
      } as const;
    });

    const [a, b] = await Promise.all([
      request(app).post("/forecast-runs/trigger").send({}),
      request(app).post("/forecast-runs/trigger").send({}),
    ]);

    const statuses = [a.body.status, b.body.status].sort();
    expect(statuses).toEqual(["skipped", "started"]);
  });

  it("runForecastPipeline returns runId via createForecastRunWithData", async () => {
    const spy = vi
      .spyOn(pipelineService, "runForecastPipeline")
      .mockResolvedValue({
        runId: "run_pipeline",
        durationMs: 12,
        counts: { modelForecasts: 1, consensuses: 1, edgeSignals: 1 },
      });

    const res = await request(app).post("/forecast-runs/trigger").send({});

    expect(res.status).toBe(202);
    expect(res.body.runId).toBe("run_pipeline");
    expect(spy).toHaveBeenCalled();
  });

  it("GET /forecast-runs/latest returns 404 when empty", async () => {
    const res = await request(app).get("/forecast-runs/latest");
    expect(res.status).toBe(404);
  });

  it("GET /forecast-runs/latest returns 200 after create", async () => {
    const created = await request(app).post("/forecast-runs").send(basePayload);
    const res = await request(app).get("/forecast-runs/latest");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.runId);
  });

  it("GET /forecast-runs supports pagination", async () => {
    await request(app).post("/forecast-runs").send(basePayload);
    await request(app)
      .post("/forecast-runs")
      .send({
        ...basePayload,
        run: { ...basePayload.run, runTimeUtc: "2026-02-27T12:00:00.000Z" },
      });

    const res = await request(app).get("/forecast-runs?limit=1&offset=0");

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
    expect(res.body.total).toBe(2);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].counts.modelForecasts).toBe(1);
  });

  it("GET /forecast-runs/summary returns counts/avg/top", async () => {
    const created = await request(app).post("/forecast-runs").send(basePayload);

    const res = await request(app).get(`/forecast-runs/summary?runId=${created.body.runId}`);

    expect(res.status).toBe(200);
    expect(res.body.totalSignals).toBe(1);
    expect(res.body.betCount).toBe(1);
    expect(res.body.noBetCount).toBe(0);
    expect(res.body.avgEdge).toBeCloseTo(0.2, 5);
    expect(Array.isArray(res.body.topPositiveEdges)).toBe(true);
    expect(res.body.topPositiveEdges.length).toBe(1);
  });

  it("safeParse returns fallback for broken json", () => {
    const parsed = safeParse<Record<string, number>>("{broken", { fallback: 1 });
    expect(parsed).toEqual({ fallback: 1 });
  });
});
