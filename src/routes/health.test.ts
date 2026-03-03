import { afterEach, describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import { resetMetrics, recordCall } from "../utils/metrics.js";

afterEach(() => {
  resetMetrics();
});

describe("GET /health", () => {
  it("returns { ok: true }", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("GET /health/metrics", () => {
  it("returns ok:true with empty services when no calls recorded", async () => {
    const res = await request(app).get("/health/metrics");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db.ok).toBe(true);
    expect(typeof res.body.services).toBe("object");
    expect(typeof res.body.generatedAt).toBe("string");
  });

  it("reflects recorded service metrics", async () => {
    recordCall("open-meteo", 300, 0);
    recordCall("polymarket", 500, 1, "timeout");

    const res = await request(app).get("/health/metrics");
    expect(res.status).toBe(200);
    expect(res.body.services["open-meteo"].callCount).toBe(1);
    expect(res.body.services["polymarket"].errorCount).toBe(1);
    expect(res.body.services["polymarket"].retryCount).toBe(1);
  });

  it("degraded when error rate > 50% for any service", async () => {
    // 1 success + 1 error = 50% error rate, borderline (not > 0.5)
    recordCall("openrouter", 100, 0, "error");
    // 3 failures out of 3 = 100% error rate → degraded
    recordCall("openrouter", 200, 0, "timeout");
    recordCall("openrouter", 300, 0, "timeout");

    const res = await request(app).get("/health/metrics");
    expect(res.body.ok).toBe(false);
  });
});
