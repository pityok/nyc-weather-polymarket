import {
  getEdgeSignalsSummary,
  getForecastRunWithRelations,
  getLatestForecastRun,
  listForecastRuns,
} from "../db/forecastRepo.js";
import type { DashboardSnapshotQuery } from "../types/dashboardQuery.js";

export async function buildDashboardSnapshot(query: DashboardSnapshotQuery) {
  const run = query.runId
    ? await getForecastRunWithRelations(query.runId)
    : await getLatestForecastRun();

  if (!run) return null;

  const summary = await getEdgeSignalsSummary(run.id);

  const response = {
    run,
    summary,
    meta: {
      source: query.runId ? "by-runId" : "latest",
      generatedAt: new Date().toISOString(),
    },
  } as {
    run: typeof run;
    summary: Awaited<ReturnType<typeof getEdgeSignalsSummary>>;
    meta: { source: "latest" | "by-runId"; generatedAt: string };
    history?: Awaited<ReturnType<typeof listForecastRuns>>["items"];
  };

  if (query.includeHistory) {
    const history = await listForecastRuns({ limit: query.historyLimit, offset: 0 });
    response.history = history.items;
  }

  return response;
}
