/**
 * Lightweight in-memory metrics for observability.
 * Tracks per-service: call count, error count, retry count, latency.
 * Resets on process restart (no persistence needed for basic observability).
 * Exposed via GET /health/metrics.
 */

export type ServiceMetrics = {
  callCount: number;
  errorCount: number;
  retryCount: number;
  totalLatencyMs: number;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

export type ServiceMetricsSummary = ServiceMetrics & {
  avgLatencyMs: number;
  errorRate: number;
};

const store = new Map<string, ServiceMetrics>();

function getOrCreate(service: string): ServiceMetrics {
  if (!store.has(service)) {
    store.set(service, {
      callCount: 0,
      errorCount: 0,
      retryCount: 0,
      totalLatencyMs: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
    });
  }
  return store.get(service)!;
}

/**
 * Record a completed external call.
 * @param service  Label for the external service (e.g. "open-meteo", "polymarket", "openrouter")
 * @param latencyMs Total duration of the call including retries
 * @param retries  Number of retries consumed (0 = success on first attempt)
 * @param error    Error message if call ultimately failed
 */
export function recordCall(
  service: string,
  latencyMs: number,
  retries: number,
  error?: string,
): void {
  const m = getOrCreate(service);
  m.callCount += 1;
  m.totalLatencyMs += latencyMs;
  m.retryCount += retries;
  if (error) {
    m.errorCount += 1;
    m.lastErrorAt = new Date().toISOString();
    m.lastErrorMessage = error;
  }
}

/**
 * Returns a snapshot of all tracked service metrics with derived fields.
 */
export function getMetrics(): Record<string, ServiceMetricsSummary> {
  const result: Record<string, ServiceMetricsSummary> = {};
  for (const [service, m] of store) {
    result[service] = {
      ...m,
      avgLatencyMs: m.callCount ? Number((m.totalLatencyMs / m.callCount).toFixed(1)) : 0,
      errorRate: m.callCount ? Number((m.errorCount / m.callCount).toFixed(4)) : 0,
    };
  }
  return result;
}

/** Reset all counters (useful in tests). */
export function resetMetrics(): void {
  store.clear();
}
