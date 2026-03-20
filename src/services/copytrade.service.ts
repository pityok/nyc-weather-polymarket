import { config } from "../config/index.js";
import {
  clearCopytradeStateStore,
  loadCopytradeStateStore,
  saveCopytradeStateStore,
} from "../db/copytradeRepo.js";
import {
  fetchWithRetry,
  RETRY_POLYMARKET,
} from "../utils/fetchWithRetry.js";
import { logWithTime } from "../utils/time.js";
import {
  copytradeConfigPatchSchema,
  copytradeModeBodySchema,
  copytradePauseBodySchema,
  copytradeStateSchema,
  type CopytradeConfigPatch,
  type CopytradeEvaluatedRow,
  type CopytradeMode,
  type CopytradeSnapshot,
  type CopytradeState,
  type CopytradeSystemState,
} from "../types/copytrade.js";

const POLYMARKET_ACTIVITY_URL = "https://data-api.polymarket.com/activity";
const POLYMARKET_POSITIONS_URL = "https://data-api.polymarket.com/positions";
const COPYTRADE_USER_AGENT = "nyc-weather-polymarket-copytrade/0.2";
const DAY_SECONDS = 86_400;

type PositionRow = CopytradeState["positionRows"][number];

type RawActivity = {
  conditionId?: unknown;
  eventSlug?: unknown;
  name?: unknown;
  outcome?: unknown;
  price?: unknown;
  side?: unknown;
  size?: unknown;
  timestamp?: unknown;
  title?: unknown;
  transactionHash?: unknown;
  type?: unknown;
  usdcSize?: unknown;
};

type RawPosition = {
  avgPrice?: unknown;
  cashPnl?: unknown;
  conditionId?: unknown;
  curPrice?: unknown;
  currentValue?: unknown;
  outcome?: unknown;
  realizedPnl?: unknown;
  size?: unknown;
  title?: unknown;
};

type AggregatedLeaderRow = {
  conditionId: string;
  market: string;
  outcome: string;
  lexNetShares: number;
  lastPrice: number;
  avgTradePrice: number;
  lastTs: number;
  partialFillCount: number;
  totalVolumeUsd: number;
};

type LeaderActivityFetchResult = {
  items: RawActivity[];
  incremental: boolean;
};

const initialState: CopytradeState = copytradeStateSchema.parse({
  mode: "dry-run",
  bot: {
    runtime: "running",
    health: "ok",
    lastSyncAt: "2026-03-19T14:20:00.000Z",
    lagSec: 2.1,
    pausedReason: null,
  },
  leader: {
    name: "Lex-tang",
    wallet: config.copytradeLeaderWallet,
    activity24h: 17,
    weatherActivity24h: 12,
  },
  follower: {
    wallet: config.copytradeFollowerWallet,
    totalExposure: 118,
  },
  config: {
    scale: 0.1,
    minTradeNotionalUsd: 2,
    forceRebalanceNotionalUsd: 8,
    quietWindowSec: 90,
    rebalanceWindowSec: 300,
    maxSignalAgeSec: 180,
    maxSlippagePct: 1.5,
    maxPriceDriftPct: 1.5,
    maxTotalExposure: 150,
    maxMarketExposure: 15,
    copyEntries: true,
    copyExits: true,
    copyNoSide: false,
    skipWideMarket: true,
    respectCooldown: true,
    weatherOnly: true,
  },
  stats: {
    processed24h: 17,
    skipped24h: 5,
    held24h: 3,
    trackingErrorPct: 2.4,
    avgSlippagePct: 0.7,
    realizedPnl: 6.2,
    unrealizedPnl: 18.6,
    mtmPnl: 24.8,
  },
  leaderEvents: [
    {
      market: "NYC 61-62F",
      outcome: "YES",
      action: "BUY",
      sizeUsd: 18.4,
      priceCents: 39.1,
      signalAgeSec: 24,
      txHash: "0x7b4e...9f2c",
      group: "agg-nyc-61-62",
      partialFills: 4,
      note: "Четвёртый microfill в той же aggregation group. Lex net продолжает расти.",
      tone: "good",
    },
    {
      market: "Chicago 48-49F",
      outcome: "YES",
      action: "BUY",
      sizeUsd: 6.8,
      priceCents: 44.7,
      signalAgeSec: 71,
      txHash: "0x28b1...0c43",
      group: "agg-chi-48-49",
      partialFills: 2,
      note: "Сигнал свежий, но quiet window ещё не закрыт.",
      tone: "warn",
    },
    {
      market: "Miami 79-80F",
      outcome: "YES",
      action: "SELL",
      sizeUsd: 11.6,
      priceCents: 57.9,
      signalAgeSec: 142,
      txHash: "0x1cc3...7b1e",
      group: "agg-mia-79-80",
      partialFills: 3,
      note: "Lex снижает net size. Для follower это сигнал на уменьшение target.",
      tone: "bad",
    },
  ],
  positionRows: [
    {
      conditionId: "cond-nyc-61-62-yes",
      market: "NYC 61-62F",
      outcome: "YES",
      lexNetShares: 132,
      myCurrentShares: 8.1,
      midCents: 39.3,
      bestBidCents: 38.8,
      bestAskCents: 39.8,
      avgEntryCents: 37.5,
      signalAgeSec: 24,
      partialFillCount: 4,
      quietWindowLeftSec: 0,
      depthUsd: 520,
      wideMarket: false,
      driftBlocked: false,
      decisionTime: "15:42:26",
      executionTime: "15:42:28",
      executionPhase: "order_staged",
      unrealizedPnlUsd: 1.46,
    },
    {
      conditionId: "cond-chi-48-49-yes",
      market: "Chicago 48-49F",
      outcome: "YES",
      lexNetShares: 72,
      myCurrentShares: 5.8,
      midCents: 44.6,
      bestBidCents: 44.1,
      bestAskCents: 45.0,
      avgEntryCents: 43.8,
      signalAgeSec: 71,
      partialFillCount: 2,
      quietWindowLeftSec: 19,
      depthUsd: 118,
      wideMarket: false,
      driftBlocked: false,
      decisionTime: "15:40:54",
      executionTime: "15:40:54",
      executionPhase: "quiet_window",
      unrealizedPnlUsd: 0.32,
    },
    {
      conditionId: "cond-mia-79-80-yes",
      market: "Miami 79-80F",
      outcome: "YES",
      lexNetShares: 44,
      myCurrentShares: 6.7,
      midCents: 57.6,
      bestBidCents: 57.1,
      bestAskCents: 58.0,
      avgEntryCents: 54.2,
      signalAgeSec: 142,
      partialFillCount: 3,
      quietWindowLeftSec: 0,
      depthUsd: 160,
      wideMarket: false,
      driftBlocked: false,
      decisionTime: "15:40:02",
      executionTime: "15:40:02",
      executionPhase: "below_min_trade_notional",
      unrealizedPnlUsd: 2.28,
    },
    {
      conditionId: "cond-sea-54-55-yes",
      market: "Seattle 54-55F",
      outcome: "YES",
      lexNetShares: 166,
      myCurrentShares: 8.5,
      midCents: 53.9,
      bestBidCents: 52.8,
      bestAskCents: 55.1,
      avgEntryCents: 49.8,
      signalAgeSec: 38,
      partialFillCount: 5,
      quietWindowLeftSec: 0,
      depthUsd: 72,
      wideMarket: true,
      driftBlocked: true,
      decisionTime: "15:39:17",
      executionTime: "15:39:19",
      executionPhase: "risk_block",
      unrealizedPnlUsd: 3.48,
    },
  ],
});

const state: CopytradeState = structuredClone(initialState);
const persistence = {
  activityCursorSec: null as number | null,
  dedupKeys: [] as string[],
  refreshCount: 0,
  lastRefreshAt: null as string | null,
  lastRefreshOkAt: null as string | null,
  lastRefreshError: null as string | null,
};
const runtimeLogs = {
  decisionLog: [] as CopytradeEvaluatedRow[],
  executionLog: [] as CopytradeEvaluatedRow[],
};
let refreshPromise: Promise<CopytradeSnapshot> | null = null;
let initPromise: Promise<void> | null = null;
let initializedFromStore = false;

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOutcome(value: unknown): string {
  const outcome = str(value).toUpperCase();
  return outcome === "YES" || outcome === "NO" ? outcome : "";
}

function normalizeSide(value: unknown): "BUY" | "SELL" | "" {
  const side = str(value).toUpperCase();
  return side === "BUY" || side === "SELL" ? side : "";
}

function toIsoNow() {
  return new Date().toISOString();
}

function clockTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function fullResyncEvery() {
  return Math.max(1, Math.trunc(config.copytradeFullResyncEvery));
}

function shouldForceFullResync() {
  return persistence.refreshCount > 0 && persistence.refreshCount % fullResyncEvery() === 0;
}

function recordActivityMetadata(activity: RawActivity[]) {
  let newestTs: number | null = null;
  const dedupKeys: string[] = [];
  const seen = new Set<string>();

  for (const item of activity) {
    const key = activityKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      dedupKeys.push(key);
    }

    const ts = Math.trunc(num(item.timestamp));
    if (ts > 0 && (newestTs === null || ts > newestTs)) {
      newestTs = ts;
    }

    if (dedupKeys.length >= 500) {
      break;
    }
  }

  persistence.activityCursorSec = newestTs;
  persistence.dedupKeys = dedupKeys;
}

function mergeRowsByKey(
  freshRows: CopytradeEvaluatedRow[],
  existingRows: CopytradeEvaluatedRow[],
  keyFn: (row: CopytradeEvaluatedRow) => string,
  limit = 20,
) {
  const merged: CopytradeEvaluatedRow[] = [];
  const seen = new Set<string>();

  for (const row of [...freshRows, ...existingRows]) {
    const key = keyFn(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(structuredClone(row));
    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
}

function decisionLogKey(row: CopytradeEvaluatedRow) {
  return [
    row.conditionId,
    row.outcome,
    row.action,
    row.status,
    row.myCurrentShares,
    row.myTargetShares,
    row.deltaShares,
    row.reason,
  ].join('|');
}

function executionLedgerKey(row: CopytradeEvaluatedRow) {
  return [
    row.conditionId,
    row.outcome,
    row.action,
    row.myCurrentShares,
    row.myTargetShares,
    row.deltaShares,
    row.deltaNotional,
    row.executionPhase,
  ].join('|');
}

function buildExecutionLedgerEntries(rows: CopytradeEvaluatedRow[]) {
  if ((state.mode !== 'paper' && state.mode !== 'real') || persistence.activityCursorSec === null) {
    return [] as CopytradeEvaluatedRow[];
  }

  const executionTime = clockTime();
  const executionPhase = state.mode === 'paper' ? 'paper_order_staged' : 'real_order_staged';
  const reasonPrefix = state.mode === 'paper'
    ? 'Paper ledger staged'
    : 'Live execution staged';

  return rows
    .filter((row) => (row.action === 'BUY' || row.action === 'SELL') && row.status === 'READY')
    .map((row): CopytradeEvaluatedRow => ({
      ...row,
      status: "EXECUTING",
      executionStatus: "EXECUTING",
      executionTime,
      executionPhase,
      reason: `${reasonPrefix} ${row.action} toward myTargetShares without mutating follower wallet state yet.`,
    }));
}

function syncRuntimeLogs(rows: CopytradeEvaluatedRow[]) {
  runtimeLogs.decisionLog = mergeRowsByKey(rows, runtimeLogs.decisionLog, decisionLogKey, 40);

  const executionEntries = buildExecutionLedgerEntries(rows);
  if (executionEntries.length > 0) {
    runtimeLogs.executionLog = mergeRowsByKey(executionEntries, runtimeLogs.executionLog, executionLedgerKey, 40);
  }
}

function snapshotDecisionLog(rows: CopytradeEvaluatedRow[]) {
  return runtimeLogs.decisionLog.length > 0
    ? structuredClone(runtimeLogs.decisionLog)
    : structuredClone(rows);
}

function snapshotExecutionLog(rows: CopytradeEvaluatedRow[]) {
  return runtimeLogs.executionLog.length > 0
    ? structuredClone(runtimeLogs.executionLog)
    : structuredClone(rows);
}

async function persistCurrentState() {
  const rows = getRows();
  syncRuntimeLogs(rows);
  await saveCopytradeStateStore({
    state: structuredClone(state),
    activityCursorSec: persistence.activityCursorSec,
    dedupKeys: [...persistence.dedupKeys],
    decisionLog: snapshotDecisionLog(rows),
    executionLog: runtimeLogs.executionLog.length > 0 ? structuredClone(runtimeLogs.executionLog) : [],
    refreshCount: persistence.refreshCount,
    lastRefreshAt: persistence.lastRefreshAt,
    lastRefreshOkAt: persistence.lastRefreshOkAt,
    lastRefreshError: persistence.lastRefreshError,
  });
}

export async function initializeCopytradeState(options?: { force?: boolean }) {
  if (initializedFromStore && !options?.force) {
    return;
  }

  if (initPromise && !options?.force) {
    return initPromise;
  }

  initPromise = (async () => {
    const persisted = await loadCopytradeStateStore();

    if (!persisted) {
      initializedFromStore = true;
      await persistCurrentState();
      logWithTime("copytrade", "no persisted state found, seeded sqlite store from initial copytrade state");
      return;
    }

    Object.assign(state, structuredClone(persisted.state));
    persistence.activityCursorSec = persisted.activityCursorSec;
    persistence.dedupKeys = [...persisted.dedupKeys];
    persistence.refreshCount = persisted.refreshCount;
    persistence.lastRefreshAt = persisted.lastRefreshAt;
    persistence.lastRefreshOkAt = persisted.lastRefreshOkAt;
    persistence.lastRefreshError = persisted.lastRefreshError;
    runtimeLogs.decisionLog = structuredClone(persisted.decisionLog);
    runtimeLogs.executionLog = structuredClone(persisted.executionLog);
    initializedFromStore = true;
    logWithTime("copytrade", `restored persisted state rows=${state.positionRows.length} updatedAt=${persisted.updatedAt}`);
  })()
    .catch((error) => {
      initializedFromStore = false;
      logWithTime("copytrade", `failed to restore persisted state error=${error instanceof Error ? error.message : String(error)}`);
      throw error;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

function isWeatherMarket(title: string, eventSlug: string) {
  return /highest temperature/i.test(title) || /highest-temperature/i.test(eventSlug);
}

function cityShort(city: string) {
  const map: Record<string, string> = {
    "New York City": "NYC",
    Atlanta: "ATL",
    Chicago: "CHI",
    Dallas: "DAL",
    London: "LON",
    "Los Angeles": "LA",
    Miami: "MIA",
    Munich: "MUC",
    Seattle: "SEA",
    Tokyo: "TYO",
    Toronto: "TOR",
    Wellington: "WEL",
  };
  return map[city] ?? city;
}

function shortWeatherTitle(title: string) {
  const betweenMatch = title.match(/Will the highest temperature in (.+?) be between (.+?) on/i);
  if (betweenMatch) {
    return `${cityShort(betweenMatch[1])} ${betweenMatch[2].replace(/\s+/g, "")}`;
  }

  const exactMatch = title.match(/Will the highest temperature in (.+?) be (.+?) on/i);
  if (exactMatch) {
    return `${cityShort(exactMatch[1])} ${exactMatch[2].replace(/\s+/g, "")}`;
  }

  return title;
}

function freeBudget() {
  return round(Math.max(0, state.config.maxTotalExposure - state.follower.totalExposure));
}

function isLimitBreached() {
  return state.follower.totalExposure > state.config.maxTotalExposure;
}

function sharesTarget(row: PositionRow) {
  return round(row.lexNetShares * state.config.scale, 1);
}

function deltaShares(row: PositionRow) {
  return round(sharesTarget(row) - row.myCurrentShares, 1);
}

function deltaNotional(row: PositionRow) {
  return round(Math.abs(deltaShares(row)) * row.midCents / 100, 2);
}

function lexNotional(row: PositionRow) {
  return round(row.lexNetShares * row.midCents / 100, 1);
}

function executionStatus(row: CopytradeEvaluatedRow): CopytradeEvaluatedRow["status"] {
  if (row.action === "BUY" || row.action === "SELL") {
    if ((state.mode === "paper" || state.mode === "real") && row.status === "READY") {
      return "EXECUTING";
    }
    return row.status;
  }
  return row.status;
}

function plannerCapacity() {
  return Math.max(1, Math.min(8, Math.floor(state.config.rebalanceWindowSec / 60)));
}

function evaluateRow(row: PositionRow): CopytradeEvaluatedRow {
  const myTargetShares = sharesTarget(row);
  const delta = deltaShares(row);
  const notional = deltaNotional(row);
  const targetNotional = round(Math.abs(myTargetShares * row.midCents / 100), 2);
  const limitBreached = isLimitBreached();
  const quietGateCleared = row.quietWindowLeftSec === 0 || notional >= state.config.forceRebalanceNotionalUsd;
  const canBuy = !limitBreached;
  const isEntry = row.myCurrentShares <= 0 && myTargetShares > 0 && delta > 0;
  const isExit = row.myCurrentShares > 0 && myTargetShares <= 0 && delta < 0;
  const isNoOutcome = row.outcome === "NO";

  let action: CopytradeEvaluatedRow["action"] = "HOLD";
  let status: CopytradeEvaluatedRow["status"] = "WAITING";
  let reason = "Queue is waiting for a clearer execution window.";

  if (isNoOutcome && !state.config.copyNoSide) {
    action = "SKIP";
    status = "BLOCKED";
    reason = "copyNoSide=false, so NO-side target updates are ignored.";
  } else if (isEntry && !state.config.copyEntries) {
    action = "SKIP";
    status = "BLOCKED";
    reason = "copyEntries=false, so new leader entries are not copied.";
  } else if (isExit && !state.config.copyExits) {
    action = "SKIP";
    status = "BLOCKED";
    reason = "copyExits=false, so full exits are not copied.";
  } else if (row.signalAgeSec > state.config.maxSignalAgeSec) {
    action = "SKIP";
    status = "BLOCKED";
    reason = "signalAgeSec exceeded maxSignalAgeSec, so this target update is stale.";
  } else if (row.wideMarket && row.driftBlocked && state.config.skipWideMarket) {
    action = "SKIP";
    status = "BLOCKED";
    reason = "skipWideMarket blocked this row because spread and drift are outside limits.";
  } else if (delta > 0 && !canBuy) {
    action = "HOLD";
    status = "BLOCKED";
    reason = "LIMIT BREACHED: new BUY blocked, bot restricted to HOLD/SELL only.";
  } else if (delta > 0 && targetNotional > state.config.maxMarketExposure) {
    action = "BUY";
    status = "BLOCKED";
    reason = `Target market exposure $${targetNotional.toFixed(2)} exceeds maxMarketExposure $${state.config.maxMarketExposure.toFixed(2)}.`;
  } else if (Math.abs(delta) < 0.1) {
    action = "HOLD";
    status = "WAITING";
    reason = "myCurrentShares already matches myTargetShares closely enough.";
  } else if (notional < state.config.minTradeNotionalUsd) {
    action = "HOLD";
    status = "WAITING";
    reason = `deltaNotional $${notional.toFixed(2)} is below minTradeNotionalUsd $${state.config.minTradeNotionalUsd.toFixed(2)}.`;
  } else if (!quietGateCleared) {
    action = "HOLD";
    status = "WAITING";
    reason = `quiet window still has ${row.quietWindowLeftSec}s left and forceRebalanceNotionalUsd is not reached.`;
  } else if (state.mode === "paused" && delta !== 0) {
    action = delta > 0 ? "BUY" : "SELL";
    status = "BLOCKED";
    reason = "Execution paused. Target keeps updating, but market access is disabled.";
  } else {
    action = delta > 0 ? "BUY" : "SELL";
    status = "READY";
    reason = delta > 0
      ? `Raise position toward myTargetShares; deltaNotional $${notional.toFixed(2)} is tradable.`
      : `Reduce position toward myTargetShares; deltaNotional $${notional.toFixed(2)} is tradable.`;
  }

  const evaluated: CopytradeEvaluatedRow = {
    ...row,
    myTargetShares,
    deltaShares: delta,
    deltaNotional: notional,
    lexNetNotional: lexNotional(row),
    action,
    status,
    reason,
    executionStatus: status,
    lastLeaderActivitySec: row.signalAgeSec,
    checks: [
      { label: "signal fresh", ok: row.signalAgeSec <= state.config.maxSignalAgeSec },
      { label: "minTradeNotionalUsd reached", ok: notional >= state.config.minTradeNotionalUsd },
      { label: "quiet window clear / forceRebalanceNotionalUsd override", ok: quietGateCleared },
      { label: "within exposure limit", ok: !limitBreached || delta <= 0 },
      { label: "market liquid", ok: !(row.wideMarket && row.driftBlocked && state.config.skipWideMarket) },
    ],
  };

  evaluated.executionStatus = executionStatus(evaluated);
  return evaluated;
}

function plannerPriority(row: CopytradeEvaluatedRow) {
  if (row.status === "READY" && row.action === "SELL") {
    return 0;
  }
  if (row.status === "READY" && row.action === "BUY") {
    return 1;
  }
  if (row.status === "WAITING") {
    return 2;
  }
  if (row.status === "BLOCKED") {
    return 3;
  }
  return 4;
}

function plannerPhase(row: CopytradeEvaluatedRow) {
  if (row.status === "BLOCKED") {
    if (row.reason.includes("maxMarketExposure")) {
      return "market_limit";
    }
    if (row.reason.includes("LIMIT BREACHED")) {
      return "exposure_limit";
    }
    if (row.reason.includes("maxSignalAgeSec")) {
      return "stale_signal";
    }
    if (row.reason.includes("skipWideMarket")) {
      return "risk_block";
    }
    if (row.reason.includes("Execution paused")) {
      return "execution_paused";
    }
    return "policy_block";
  }

  if (row.status === "WAITING") {
    if (Math.abs(row.deltaShares) < 0.1) {
      return "target_synced";
    }
    if (row.reason.includes("minTradeNotionalUsd")) {
      return "below_min_trade_notional";
    }
    if (row.reason.includes("quiet window")) {
      return "quiet_window";
    }
    return "queued";
  }

  return row.action === "SELL" ? "exit_order_staged" : "order_staged";
}

function planRebalanceQueue(rows: CopytradeEvaluatedRow[]): CopytradeEvaluatedRow[] {
  const ordered = [...rows].sort((a, b) => (
    plannerPriority(a) - plannerPriority(b)
    || a.signalAgeSec - b.signalAgeSec
    || b.deltaNotional - a.deltaNotional
    || b.lexNetShares - a.lexNetShares
  ));

  let remainingBudget = freeBudget();
  let staged = 0;
  const capacity = plannerCapacity();

  return ordered.map((row): CopytradeEvaluatedRow => {
    const planned: CopytradeEvaluatedRow = {
      ...row,
      executionPhase: plannerPhase(row),
      executionStatus: executionStatus(row),
    };

    if (row.status !== "READY" || (row.action !== "BUY" && row.action !== "SELL")) {
      return planned;
    }

    if (staged >= capacity) {
      return {
        ...planned,
        status: "WAITING" as const,
        executionStatus: "WAITING" as const,
        executionPhase: "queued_backlog",
        reason: `Queued behind ${capacity} staged orders in the current rebalance window.`,
      };
    }

    if (row.action === "BUY" && row.deltaNotional > remainingBudget) {
      return {
        ...planned,
        status: "WAITING" as const,
        executionStatus: "WAITING" as const,
        executionPhase: "queued_for_budget",
        reason: `Queued: free budget $${remainingBudget.toFixed(2)} is reserved by higher-priority rebalances.`,
      };
    }

    staged += 1;
    if (row.action === "BUY") {
      remainingBudget = round(Math.max(0, remainingBudget - row.deltaNotional), 2);
    } else {
      remainingBudget = round(remainingBudget + row.deltaNotional, 2);
    }

    return {
      ...planned,
      executionPhase: row.action === "SELL" ? "exit_order_staged" : "order_staged",
      executionStatus: executionStatus(row),
    };
  });
}

function getRows() {
  return planRebalanceQueue(state.positionRows.map(evaluateRow));
}

function pendingRebalances(rows: CopytradeEvaluatedRow[]) {
  return rows.filter((row) => row.status === "READY" || row.status === "WAITING").length;
}

function systemStates(rows: CopytradeEvaluatedRow[]): CopytradeSystemState[] {
  const hasStaleRows = rows.some((row) => row.signalAgeSec > state.config.maxSignalAgeSec);
  return [
    {
      name: "loading",
      active: state.bot.runtime === "loading",
      value: state.bot.runtime === "loading" ? "ACTIVE" : "STANDBY",
      note: state.bot.runtime === "loading"
        ? "Refreshing leader activity, positions snapshot and risk state."
        : "Snapshot is idle and ready for the next backend poll.",
      tone: state.bot.runtime === "loading" ? "warn" : "good",
    },
    {
      name: "stale data",
      active: hasStaleRows,
      value: hasStaleRows ? "ACTIVE" : "CLEAR",
      note: hasStaleRows
        ? "One or more targets exceeded maxSignalAgeSec and are blocked."
        : "All visible rows are still inside the configured freshness window.",
      tone: hasStaleRows ? "bad" : "good",
    },
    {
      name: "sync error",
      active: state.bot.health === "error",
      value: state.bot.health === "error" ? "ACTIVE" : "CLEAR",
      note: state.bot.health === "error"
        ? "Leader activity or follower positions failed to reconcile."
        : "Last target-position sync completed without hard errors.",
      tone: state.bot.health === "error" ? "bad" : "good",
    },
    {
      name: "api lagging",
      active: state.bot.lagSec >= 5,
      value: state.bot.lagSec >= 5 ? "ACTIVE" : "CLEAR",
      note: state.bot.lagSec >= 5
        ? `End-to-end lag is ${state.bot.lagSec.toFixed(1)}s and should be monitored.`
        : `Current lag is ${state.bot.lagSec.toFixed(1)}s and stays inside the expected envelope.`,
      tone: state.bot.lagSec >= 5 ? "warn" : "good",
    },
    {
      name: "no positions",
      active: rows.length === 0,
      value: rows.length === 0 ? "ACTIVE" : "CLEAR",
      note: rows.length === 0
        ? "Follower currently has no copied positions."
        : `${rows.length} open copied positions are present in the canonical model.`,
      tone: rows.length === 0 ? "warn" : "good",
    },
    {
      name: "execution paused",
      active: state.mode === "paused",
      value: state.mode === "paused" ? "ACTIVE" : "STANDBY",
      note: state.mode === "paused"
        ? "Decisioning continues, but BUY/SELL cannot leave the dashboard."
        : "Pause state is wired and ready to block execution when needed.",
      tone: state.mode === "paused" ? "bad" : "warn",
    },
  ];
}

function touchSync() {
  state.bot.lastSyncAt = toIsoNow();
  if (state.mode === "paused") {
    state.bot.runtime = "paused";
  } else if (state.bot.runtime === "paused") {
    state.bot.runtime = "running";
  }
}

function activityKey(item: RawActivity) {
  return [
    str(item.transactionHash),
    String(Math.trunc(num(item.timestamp))),
    str(item.type),
    str(item.side),
    normalizeOutcome(item.outcome),
    str(item.title),
    String(num(item.size)),
    String(num(item.price)),
  ].join("|");
}

async function fetchActivityPage(wallet: string, limit: number, offset: number) {
  const url = `${POLYMARKET_ACTIVITY_URL}?user=${encodeURIComponent(wallet)}&limit=${limit}&offset=${offset}`;
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": COPYTRADE_USER_AGENT,
      },
    },
    RETRY_POLYMARKET,
  );
  const payload = await res.json();
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected copytrade activity payload");
  }
  return payload as RawActivity[];
}

async function fetchAllLeaderActivity(wallet: string, options?: { forceFull?: boolean }): Promise<LeaderActivityFetchResult> {
  const rows: RawActivity[] = [];
  const seen = new Set<string>();
  const persistedDedup = new Set(persistence.dedupKeys);
  const cursorSec = persistence.activityCursorSec;
  const canIncremental = !options?.forceFull && cursorSec !== null && persistedDedup.size > 0 && state.positionRows.length > 0;
  const pageLimit = config.copytradeActivityPageLimit;

  for (let page = 0; page < config.copytradeActivityMaxPages; page += 1) {
    const offset = page * pageLimit;
    const payload = await fetchActivityPage(wallet, pageLimit, offset);
    if (payload.length === 0) {
      break;
    }

    let shouldStop = false;

    for (const item of payload) {
      if (str(item.type).toUpperCase() !== "TRADE") {
        continue;
      }

      const key = activityKey(item);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const timestampSec = Math.trunc(num(item.timestamp));
      if (canIncremental) {
        if (persistedDedup.has(key)) {
          shouldStop = true;
          continue;
        }

        if (cursorSec !== null && timestampSec < cursorSec) {
          shouldStop = true;
          continue;
        }
      }

      rows.push(item);
    }

    if (payload.length < pageLimit || shouldStop) {
      break;
    }
  }

  rows.sort((a, b) => num(b.timestamp) - num(a.timestamp));
  return {
    items: rows,
    incremental: canIncremental,
  };
}

async function fetchFollowerPositions(wallet: string) {
  const limit = 500;
  const url = `${POLYMARKET_POSITIONS_URL}?user=${encodeURIComponent(wallet)}&limit=${limit}&offset=0&sizeThreshold=0&sortBy=CURRENT&sortDirection=DESC`;
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": COPYTRADE_USER_AGENT,
      },
    },
    RETRY_POLYMARKET,
  );
  const payload = await res.json();
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected copytrade positions payload");
  }
  return payload as RawPosition[];
}

function positionKey(conditionId: string, outcome: string) {
  return `${conditionId}::${outcome}`;
}

function buildFollowerMap(positions: RawPosition[]) {
  const map = new Map<string, RawPosition>();
  for (const position of positions) {
    const conditionId = str(position.conditionId);
    const outcome = normalizeOutcome(position.outcome);
    if (!conditionId || !outcome) {
      continue;
    }
    map.set(positionKey(conditionId, outcome), position);
  }
  return map;
}

function seedAggregatesFromPositionRows(rows: PositionRow[]) {
  const nowSec = Math.floor(Date.now() / 1000);
  const aggregates = new Map<string, AggregatedLeaderRow>();

  for (const row of rows) {
    const key = positionKey(row.conditionId, row.outcome);
    aggregates.set(key, {
      conditionId: row.conditionId,
      market: row.market,
      outcome: row.outcome,
      lexNetShares: row.lexNetShares,
      lastPrice: row.midCents / 100,
      avgTradePrice: row.avgEntryCents / 100,
      lastTs: Math.max(0, nowSec - row.signalAgeSec),
      partialFillCount: row.partialFillCount,
      totalVolumeUsd: round(Math.max(row.depthUsd / 2.5, row.lexNetShares * row.midCents / 100), 2),
    });
  }

  return aggregates;
}

function foldActivityIntoAggregates(aggregates: Map<string, AggregatedLeaderRow>, activity: RawActivity[]) {
  for (const item of activity) {
    const title = str(item.title);
    const eventSlug = str(item.eventSlug);
    if (state.config.weatherOnly && !isWeatherMarket(title, eventSlug)) {
      continue;
    }

    const conditionId = str(item.conditionId);
    const outcome = normalizeOutcome(item.outcome);
    const side = normalizeSide(item.side);
    if (!conditionId || !outcome || !side) {
      continue;
    }

    const key = positionKey(conditionId, outcome);
    const size = num(item.size);
    const price = num(item.price);
    const usdcSize = num(item.usdcSize) || size * price;
    const sign = side === "BUY" ? 1 : -1;
    const existing = aggregates.get(key) ?? {
      conditionId,
      market: shortWeatherTitle(title),
      outcome,
      lexNetShares: 0,
      lastPrice: 0,
      avgTradePrice: price,
      lastTs: 0,
      partialFillCount: 0,
      totalVolumeUsd: 0,
    };

    const prevVolumeUsd = existing.totalVolumeUsd;
    existing.market = shortWeatherTitle(title);
    existing.lexNetShares += sign * size;
    existing.totalVolumeUsd = round(existing.totalVolumeUsd + usdcSize, 2);
    existing.partialFillCount += 1;
    existing.avgTradePrice = existing.totalVolumeUsd > 0
      ? round((prevVolumeUsd + usdcSize) / Math.max((prevVolumeUsd / Math.max(existing.avgTradePrice, 0.0001)) + size, 0.0001), 6)
      : price;

    if (num(item.timestamp) >= existing.lastTs) {
      existing.lastTs = Math.trunc(num(item.timestamp));
      existing.lastPrice = price;
    }

    aggregates.set(key, existing);
  }

  return aggregates;
}

function rowsFromAggregates(aggregates: Map<string, AggregatedLeaderRow>, followerPositions: RawPosition[]) {
  const followerMap = buildFollowerMap(followerPositions);
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const timeMark = clockTime(now);
  const rows: PositionRow[] = [];

  for (const aggregate of aggregates.values()) {
    const key = positionKey(aggregate.conditionId, aggregate.outcome);
    const follower = followerMap.get(key);
    const myCurrentShares = round(num(follower?.size), 2);
    const lexNetShares = round(Math.max(0, aggregate.lexNetShares), 2);

    if (lexNetShares <= 0.05 && myCurrentShares <= 0.05) {
      continue;
    }

    const followerCurPrice = num(follower?.curPrice);
    const followerAvgPrice = num(follower?.avgPrice);
    const midCents = round(Math.max(1, (followerCurPrice || aggregate.lastPrice || aggregate.avgTradePrice) * 100), 1);
    const spreadWidth = aggregate.totalVolumeUsd < 25 ? 2.4 : aggregate.totalVolumeUsd < 75 ? 1.2 : 0.8;
    const bestBidCents = round(Math.max(1, midCents - spreadWidth / 2), 1);
    const bestAskCents = round(Math.min(99, midCents + spreadWidth / 2), 1);
    const signalAgeSec = Math.max(0, nowSec - aggregate.lastTs);
    const quietWindowLeftSec = state.config.respectCooldown
      ? Math.max(0, state.config.quietWindowSec - signalAgeSec)
      : 0;
    const wideMarket = spreadWidth > state.config.maxPriceDriftPct;

    rows.push({
      conditionId: aggregate.conditionId,
      market: aggregate.market,
      outcome: aggregate.outcome,
      lexNetShares,
      myCurrentShares,
      midCents,
      bestBidCents,
      bestAskCents,
      avgEntryCents: round(Math.max(1, (followerAvgPrice || aggregate.avgTradePrice || aggregate.lastPrice) * 100), 1),
      signalAgeSec,
      partialFillCount: aggregate.partialFillCount,
      quietWindowLeftSec,
      depthUsd: round(Math.max(aggregate.totalVolumeUsd * 2.5, 50), 2),
      wideMarket,
      driftBlocked: wideMarket,
      decisionTime: timeMark,
      executionTime: timeMark,
      executionPhase: quietWindowLeftSec > 0 ? "quiet_window" : "target_synced",
      unrealizedPnlUsd: round(num(follower?.cashPnl), 2),
    });
  }

  rows.sort((a, b) => a.signalAgeSec - b.signalAgeSec || b.lexNetShares - a.lexNetShares);
  return rows;
}

function aggregateLeaderRows(activity: RawActivity[], followerPositions: RawPosition[], options?: { incremental?: boolean }) {
  const aggregates = options?.incremental
    ? seedAggregatesFromPositionRows(state.positionRows)
    : new Map<string, AggregatedLeaderRow>();

  foldActivityIntoAggregates(aggregates, activity);
  return rowsFromAggregates(aggregates, followerPositions);
}

function buildLeaderEvents(activity: RawActivity[]) {
  const groupCounts = new Map<string, number>();
  const filtered = activity.filter((item) => {
    const title = str(item.title);
    const eventSlug = str(item.eventSlug);
    return !state.config.weatherOnly || isWeatherMarket(title, eventSlug);
  });

  for (const item of filtered) {
    const conditionId = str(item.conditionId);
    const outcome = normalizeOutcome(item.outcome);
    if (!conditionId || !outcome) {
      continue;
    }
    const key = positionKey(conditionId, outcome);
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  return filtered.slice(0, 20).flatMap((item) => {
    const side = normalizeSide(item.side);
    const conditionId = str(item.conditionId);
    const outcome = normalizeOutcome(item.outcome);
    if (!side || !conditionId || !outcome) {
      return [];
    }

    const key = positionKey(conditionId, outcome);
    const signalAgeSec = Math.max(0, nowSec - Math.trunc(num(item.timestamp)));
    const tone: "good" | "warn" | "bad" = signalAgeSec <= state.config.quietWindowSec
      ? "good"
      : signalAgeSec <= state.config.maxSignalAgeSec
        ? "warn"
        : "bad";

    return [{
      market: shortWeatherTitle(str(item.title)),
      outcome,
      action: side,
      sizeUsd: round(num(item.usdcSize) || num(item.size) * num(item.price), 2),
      priceCents: round(num(item.price) * 100, 1),
      signalAgeSec,
      txHash: str(item.transactionHash),
      group: key,
      partialFills: groupCounts.get(key) ?? 1,
      note: side === "BUY"
        ? "Fresh leader buy captured from /activity and folded into target-position state."
        : "Fresh leader sell captured from /activity and reflected in scaled target shares.",
      tone,
    }];
  });
}

function trackingError(rows: CopytradeEvaluatedRow[]) {
  const totalTargetNotional = rows.reduce((sum, row) => sum + Math.abs(row.myTargetShares * row.midCents / 100), 0);
  if (totalTargetNotional <= 0) {
    return 0;
  }
  const totalDeltaNotional = rows.reduce((sum, row) => sum + row.deltaNotional, 0);
  return round((totalDeltaNotional / totalTargetNotional) * 100, 2);
}

function mergeLeaderEvents(activity: RawActivity[], incremental: boolean) {
  const freshEvents = buildLeaderEvents(activity);
  if (!incremental) {
    return freshEvents;
  }

  const merged = [...freshEvents, ...state.leaderEvents];
  const seen = new Set<string>();
  return merged.filter((event) => {
    const key = `${event.txHash}|${event.group}|${event.action}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function applyLiveRefresh(activity: RawActivity[], followerPositions: RawPosition[], options?: { incremental?: boolean }) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (activity.length > 0) {
    recordActivityMetadata(activity);
  }
  const incremental = Boolean(options?.incremental);
  const rows = aggregateLeaderRows(activity, followerPositions, { incremental });
  const events = mergeLeaderEvents(activity, incremental);
  const latestName = str(activity[0]?.name) || state.leader.name;
  const filteredWeatherActivity = activity.filter((item) => isWeatherMarket(str(item.title), str(item.eventSlug)));
  const totalExposure = round(followerPositions.reduce((sum, position) => sum + num(position.currentValue), 0), 2);
  const realizedPnl = round(followerPositions.reduce((sum, position) => sum + num(position.realizedPnl), 0), 2);
  const unrealizedPnl = round(followerPositions.reduce((sum, position) => sum + num(position.cashPnl), 0), 2);

  state.leader = {
    name: latestName,
    wallet: state.leader.wallet,
    activity24h: incremental
      ? state.leader.activity24h + activity.filter((item) => nowSec - Math.trunc(num(item.timestamp)) <= DAY_SECONDS).length
      : activity.filter((item) => nowSec - Math.trunc(num(item.timestamp)) <= DAY_SECONDS).length,
    weatherActivity24h: incremental
      ? state.leader.weatherActivity24h + filteredWeatherActivity.filter((item) => nowSec - Math.trunc(num(item.timestamp)) <= DAY_SECONDS).length
      : filteredWeatherActivity.filter((item) => nowSec - Math.trunc(num(item.timestamp)) <= DAY_SECONDS).length,
  };
  state.follower = {
    wallet: state.follower.wallet,
    totalExposure,
  };
  state.leaderEvents = events;
  state.positionRows = rows;
  state.bot.health = rows.length > 0 ? "ok" : "warn";
  state.bot.lagSec = rows[0]?.signalAgeSec ?? 0;
  touchSync();

  const evaluatedRows = getRows();
  state.stats = {
    processed24h: incremental ? state.stats.processed24h + filteredWeatherActivity.length : filteredWeatherActivity.length,
    skipped24h: evaluatedRows.filter((row) => row.action === "SKIP").length,
    held24h: evaluatedRows.filter((row) => row.action === "HOLD").length,
    trackingErrorPct: trackingError(evaluatedRows),
    avgSlippagePct: 0,
    realizedPnl,
    unrealizedPnl,
    mtmPnl: round(realizedPnl + unrealizedPnl, 2),
  };
}

export function getCopytradeSnapshot(): CopytradeSnapshot {
  const rows = getRows();
  const decisionLog = snapshotDecisionLog(rows);
  const executionLog = snapshotExecutionLog(rows);
  const latestDecision = rows[0]
    ? {
      market: rows[0].market,
      outcome: rows[0].outcome,
      action: rows[0].action,
      status: rows[0].status,
      reason: rows[0].reason,
    }
    : null;

  return structuredClone({
    mode: state.mode,
    bot: state.bot,
    leader: state.leader,
    follower: {
      ...state.follower,
      freeBudget: freeBudget(),
    },
    config: state.config,
    stats: {
      ...state.stats,
      pendingRebalances: pendingRebalances(rows),
      openPositions: rows.length,
    },
    latestDecision,
    systemStates: systemStates(rows),
    leaderEvents: state.leaderEvents,
    rebalanceQueue: rows,
    targetState: rows,
    aggregationState: rows,
    decisionTrace: rows,
    positions: rows,
    markets: rows,
    decisionLog,
    executionLog,
    riskBars: {
      totalExposureUsd: state.follower.totalExposure,
      maxTotalExposureUsd: state.config.maxTotalExposure,
      freeBudgetUsd: freeBudget(),
      pendingRebalances: pendingRebalances(rows),
      pendingRebalancesCapacity: plannerCapacity(),
      realizedPnlUsd: state.stats.realizedPnl,
      unrealizedPnlUsd: state.stats.unrealizedPnl,
      mtmPnlUsd: state.stats.mtmPnl,
      limitBreached: isLimitBreached(),
    },
  });
}

export async function refreshCopytradeState() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const previousRuntime = state.bot.runtime;
    const refreshStartedAt = toIsoNow();
    const forceFullResync = shouldForceFullResync();
    state.bot.runtime = "loading";

    try {
      const [activityResult, followerPositions] = await Promise.all([
        fetchAllLeaderActivity(state.leader.wallet, { forceFull: forceFullResync }),
        fetchFollowerPositions(state.follower.wallet),
      ]);
      applyLiveRefresh(activityResult.items, followerPositions, { incremental: activityResult.incremental });
      persistence.refreshCount += 1;
      persistence.lastRefreshAt = refreshStartedAt;
      persistence.lastRefreshOkAt = state.bot.lastSyncAt;
      persistence.lastRefreshError = null;
      await persistCurrentState();
      const refreshMode = activityResult.incremental ? "incremental" : forceFullResync ? "full-reconcile" : "full";
      logWithTime("copytrade", `refresh ok mode=${refreshMode} leaderEvents=${state.leaderEvents.length} rows=${state.positionRows.length}`);
      return getCopytradeSnapshot();
    } catch (error) {
      state.bot.health = "error";
      state.bot.runtime = state.mode === "paused" ? "paused" : previousRuntime === "paused" ? "running" : previousRuntime;
      persistence.refreshCount += 1;
      persistence.lastRefreshAt = refreshStartedAt;
      persistence.lastRefreshError = error instanceof Error ? error.message : String(error);
      await persistCurrentState();
      logWithTime("copytrade", `refresh failed error=${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      if (state.mode === "paused") {
        state.bot.runtime = "paused";
      } else if (state.bot.runtime === "loading") {
        state.bot.runtime = "running";
      }
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function getCopytradeState() {
  return structuredClone(state);
}

export async function updateCopytradeConfig(input: unknown) {
  const patch: CopytradeConfigPatch = copytradeConfigPatchSchema.parse(input);
  Object.assign(state.config, patch);
  touchSync();
  await persistCurrentState();
  return getCopytradeSnapshot();
}

export async function setCopytradeMode(input: unknown) {
  const { mode } = copytradeModeBodySchema.parse(input);
  state.mode = mode;
  state.bot.runtime = mode === "paused" ? "paused" : "running";
  if (mode !== "paused") {
    state.bot.pausedReason = null;
  }
  touchSync();
  await persistCurrentState();
  return getCopytradeSnapshot();
}

export async function pauseCopytrade(input: unknown) {
  const { reason } = copytradePauseBodySchema.parse(input ?? {});
  state.mode = "paused";
  state.bot.runtime = "paused";
  state.bot.pausedReason = reason ?? "Paused from dashboard control";
  touchSync();
  await persistCurrentState();
  return getCopytradeSnapshot();
}

export async function resumeCopytrade() {
  state.mode = "dry-run";
  state.bot.runtime = "running";
  state.bot.pausedReason = null;
  touchSync();
  await persistCurrentState();
  return getCopytradeSnapshot();
}

export function resetCopytradeState() {
  Object.assign(state, structuredClone(initialState));
  persistence.activityCursorSec = null;
  persistence.dedupKeys = [];
  persistence.refreshCount = 0;
  persistence.lastRefreshAt = null;
  persistence.lastRefreshOkAt = null;
  persistence.lastRefreshError = null;
  runtimeLogs.decisionLog = [];
  runtimeLogs.executionLog = [];
  refreshPromise = null;
  initializedFromStore = false;
}

export async function clearCopytradePersistenceForTests() {
  await clearCopytradeStateStore();
  initializedFromStore = false;
}

export function getCopytradeMode(): CopytradeMode {
  return state.mode;
}
