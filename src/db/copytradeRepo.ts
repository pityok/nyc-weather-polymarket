import { copytradeEvaluatedRowSchema, copytradeStateSchema, type CopytradeEvaluatedRow, type CopytradeState } from "../types/copytrade.js";
import { safeParse, safeStringify } from "../utils/json.js";
import { prisma } from "./client.js";

const COPYTRADE_STATE_STORE_ID = "copytrade:main";
const COPYTRADE_STATE_SCHEMA_VERSION = 1;

export type PersistedCopytradeState = {
  state: CopytradeState;
  activityCursorSec: number | null;
  dedupKeys: string[];
  decisionLog: CopytradeEvaluatedRow[];
  executionLog: CopytradeEvaluatedRow[];
  refreshCount: number;
  lastRefreshAt: string | null;
  lastRefreshOkAt: string | null;
  lastRefreshError: string | null;
  updatedAt: string;
};

export type SaveCopytradeStateInput = Omit<PersistedCopytradeState, "updatedAt">;

function parseStringArray(value: string | null | undefined) {
  return safeParse<unknown[]>(value, []).filter((item): item is string => typeof item === "string" && item.length > 0);
}

function toDate(value: string | null) {
  return value ? new Date(value) : null;
}

export async function loadCopytradeStateStore(): Promise<PersistedCopytradeState | null> {
  const row = await prisma.copytradeStateStore.findUnique({
    where: { id: COPYTRADE_STATE_STORE_ID },
  });

  if (!row) {
    return null;
  }

  return {
    state: copytradeStateSchema.parse(safeParse(row.stateJson, null)),
    activityCursorSec: row.activityCursorSec ?? null,
    dedupKeys: parseStringArray(row.dedupKeysJson),
    decisionLog: copytradeEvaluatedRowSchema.array().parse(safeParse(row.decisionLogJson, [])),
    executionLog: copytradeEvaluatedRowSchema.array().parse(safeParse(row.executionLogJson, [])),
    refreshCount: row.refreshCount,
    lastRefreshAt: row.lastRefreshAt?.toISOString() ?? null,
    lastRefreshOkAt: row.lastRefreshOkAt?.toISOString() ?? null,
    lastRefreshError: row.lastRefreshError ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveCopytradeStateStore(input: SaveCopytradeStateInput) {
  return prisma.copytradeStateStore.upsert({
    where: { id: COPYTRADE_STATE_STORE_ID },
    create: {
      id: COPYTRADE_STATE_STORE_ID,
      schemaVersion: COPYTRADE_STATE_SCHEMA_VERSION,
      stateJson: safeStringify(input.state),
      activityCursorSec: input.activityCursorSec,
      dedupKeysJson: safeStringify(input.dedupKeys),
      decisionLogJson: safeStringify(input.decisionLog),
      executionLogJson: safeStringify(input.executionLog),
      refreshCount: input.refreshCount,
      lastRefreshAt: toDate(input.lastRefreshAt),
      lastRefreshOkAt: toDate(input.lastRefreshOkAt),
      lastRefreshError: input.lastRefreshError,
    },
    update: {
      schemaVersion: COPYTRADE_STATE_SCHEMA_VERSION,
      stateJson: safeStringify(input.state),
      activityCursorSec: input.activityCursorSec,
      dedupKeysJson: safeStringify(input.dedupKeys),
      decisionLogJson: safeStringify(input.decisionLog),
      executionLogJson: safeStringify(input.executionLog),
      refreshCount: input.refreshCount,
      lastRefreshAt: toDate(input.lastRefreshAt),
      lastRefreshOkAt: toDate(input.lastRefreshOkAt),
      lastRefreshError: input.lastRefreshError,
    },
  });
}

export async function clearCopytradeStateStore() {
  await prisma.copytradeStateStore.deleteMany({
    where: { id: COPYTRADE_STATE_STORE_ID },
  });
}
