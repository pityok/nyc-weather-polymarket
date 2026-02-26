import { prisma } from "../db/client.js";
import {
  createConsensus,
  createEdgeSignalsBulk,
  createForecastRun,
  createMarketSnapshot,
  createModelForecast,
  getForecastRunWithRelations,
} from "../db/forecastRepo.js";
import type { CreateForecastRunPayload } from "../types/forecastRunPayload.js";

export async function createForecastRunWithData(input: CreateForecastRunPayload) {
  const runId = await prisma.$transaction(async (tx) => {
    const run = await createForecastRun(input.run, tx);

    for (const modelForecast of input.modelForecasts) {
      await createModelForecast(
        { ...modelForecast, rawResponse: modelForecast.rawResponse ?? null, forecastRunId: run.id },
        tx,
      );
    }

    for (const consensus of input.consensuses) {
      await createConsensus({ ...consensus, forecastRunId: run.id }, tx);
    }

    await createEdgeSignalsBulk(
      input.edgeSignals.map((edgeSignal) => ({ ...edgeSignal, forecastRunId: run.id })),
      tx,
    );

    if (input.marketSnapshot) {
      await createMarketSnapshot(input.marketSnapshot, tx);
    }

    return run.id;
  });

  const run = await getForecastRunWithRelations(runId);
  return { runId, run };
}
