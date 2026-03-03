import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { safeParse, safeStringify } from "../utils/json.js";
import type { EdgeSignalsSummaryDto, ForecastRunListItemDto } from "../types/forecast.js";

export type Tx = Prisma.TransactionClient;

type DbClient = PrismaClient | Tx;

export type CreateForecastRunInput = {
  runTimeUtc: Date;
  runTimeMsk: Date;
  targetDate: Date;
  horizon: string;
  cityId: string;
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
  cityId: string;
};

export type CreateMarketSnapshotInput = {
  targetDate: Date;
  snapshotTimeUtc: Date;
  snapshotType: string;
  probsJson: Record<string, number>;
  source: string;
  cityId: string;
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

export async function getLatestForecastRun(cityId?: string, db: DbClient = prisma) {
  const run = await db.forecastRun.findFirst({
    where: cityId ? { cityId } : undefined,
    orderBy: { createdAt: "desc" },
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

export async function listForecastRuns(
  params: { limit: number; offset: number; cityId?: string },
  db: DbClient = prisma,
): Promise<{ items: ForecastRunListItemDto[]; limit: number; offset: number; total: number }> {
  const { limit, offset, cityId } = params;

  const where = cityId ? { cityId } : undefined;

  const [rows, total] = await Promise.all([
    db.forecastRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        runTimeUtc: true,
        runTimeMsk: true,
        targetDate: true,
        horizon: true,
        createdAt: true,
        _count: {
          select: {
            modelForecasts: true,
            consensuses: true,
            edgeSignals: true,
          },
        },
      },
    }),
    db.forecastRun.count({ where }),
  ]);

  const items: ForecastRunListItemDto[] = rows.map((row) => ({
    id: row.id,
    runTimeUtc: row.runTimeUtc,
    runTimeMsk: row.runTimeMsk,
    targetDate: row.targetDate,
    horizon: row.horizon,
    createdAt: row.createdAt,
    counts: {
      modelForecasts: row._count.modelForecasts,
      consensuses: row._count.consensuses,
      edgeSignals: row._count.edgeSignals,
    },
  }));

  return { items, limit, offset, total };
}

export async function getEdgeSignalsSummary(
  runId?: string,
  db: DbClient = prisma,
): Promise<EdgeSignalsSummaryDto> {
  const rows = await db.edgeSignal.findMany({
    where: runId ? { forecastRunId: runId } : undefined,
    select: {
      recommendation: true,
      edge: true,
      rangeKey: true,
    },
  });

  const totalSignals = rows.length;
  const betCount = rows.filter((r) => r.recommendation === "bet").length;
  const noBetCount = rows.filter((r) => r.recommendation === "no_bet").length;
  const avgEdge = totalSignals ? rows.reduce((sum, r) => sum + r.edge, 0) / totalSignals : 0;

  const topPositiveEdges = [...rows]
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 5)
    .map((r) => ({
      rangeKey: r.rangeKey,
      edge: r.edge,
      recommendation: r.recommendation,
    }));

  return {
    totalSignals,
    betCount,
    noBetCount,
    avgEdge,
    topPositiveEdges,
  };
}
