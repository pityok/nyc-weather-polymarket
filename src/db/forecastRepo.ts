import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { safeParse, safeStringify } from "../utils/json.js";

export type Tx = Prisma.TransactionClient;

type DbClient = PrismaClient | Tx;

export type CreateForecastRunInput = {
  runTimeUtc: Date;
  runTimeMsk: Date;
  targetDate: Date;
  horizon: string;
};

export type CreateModelForecastInput = {
  forecastRunId: string;
  modelId: string;
  modelName: string;
  confidence: string;
  rawResponse: unknown;
  probsJson: Record<string, number>;
  sumBeforeNormalization: number;
};

export type CreateConsensusInput = {
  forecastRunId: string;
  method: string;
  probsJson: Record<string, number>;
};

export type CreateEdgeSignalInput = {
  forecastRunId: string;
  targetDate: Date;
  rangeKey: string;
  aiProb: number;
  marketProb: number;
  edge: number;
  recommendation: string;
  reason: string;
};

export type CreateMarketSnapshotInput = {
  targetDate: Date;
  snapshotTimeUtc: Date;
  snapshotType: string;
  probsJson: Record<string, number>;
  source: string;
};

export async function createForecastRun(input: CreateForecastRunInput, db: DbClient = prisma) {
  return db.forecastRun.create({ data: input });
}

export async function createModelForecast(input: CreateModelForecastInput, db: DbClient = prisma) {
  return db.modelForecast.create({
    data: {
      ...input,
      rawResponse: safeStringify(input.rawResponse),
      probsJson: safeStringify(input.probsJson),
    },
  });
}

export async function createConsensus(input: CreateConsensusInput, db: DbClient = prisma) {
  return db.consensus.create({
    data: {
      ...input,
      probsJson: safeStringify(input.probsJson),
    },
  });
}

export async function createMarketSnapshot(input: CreateMarketSnapshotInput, db: DbClient = prisma) {
  return db.marketSnapshot.create({
    data: {
      ...input,
      probsJson: safeStringify(input.probsJson),
    },
  });
}

export async function createEdgeSignalsBulk(inputs: CreateEdgeSignalInput[], db: DbClient = prisma) {
  if (!inputs.length) return [];

  return Promise.all(inputs.map((input) => db.edgeSignal.create({ data: input })));
}

export async function getLatestSnapshotByTargetDate(targetDate: Date, db: DbClient = prisma) {
  const snapshot = await db.marketSnapshot.findFirst({
    where: { targetDate },
    orderBy: { snapshotTimeUtc: "desc" },
  });

  if (!snapshot) return null;

  return {
    ...snapshot,
    probsJson: safeParse<Record<string, number>>(snapshot.probsJson, {}),
  };
}

export async function getForecastRunWithRelations(runId: string, db: DbClient = prisma) {
  const run = await db.forecastRun.findUnique({
    where: { id: runId },
    include: {
      modelForecasts: true,
      consensuses: true,
      edgeSignals: true,
    },
  });

  if (!run) return null;

  return {
    ...run,
    modelForecasts: run.modelForecasts.map((item) => ({
      ...item,
      rawResponse: safeParse<unknown>(item.rawResponse, {}),
      probsJson: safeParse<Record<string, number>>(item.probsJson, {}),
    })),
    consensuses: run.consensuses.map((item) => ({
      ...item,
      probsJson: safeParse<Record<string, number>>(item.probsJson, {}),
    })),
  };
}
