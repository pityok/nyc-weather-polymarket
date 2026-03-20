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
    wallet: "0xaa930fdc4caa3c0f6067404a7bd7899ca45f0bc7",
    activity24h: 17,
    weatherActivity24h: 12,
  },
  follower: {
    wallet: "0xace51d70031617af61a8e809c28eebcef1c84457",
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

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function freeBudget() {
  return round(Math.max(0, state.config.maxTotalExposure - state.follower.totalExposure));
}

function isLimitBreached() {
  return state.follower.totalExposure > state.config.maxTotalExposure;
}

function sharesTarget(row: CopytradeState["positionRows"][number]) {
  return round(row.lexNetShares * state.config.scale, 1);
}

function deltaShares(row: CopytradeState["positionRows"][number]) {
  return round(sharesTarget(row) - row.myCurrentShares, 1);
}

function deltaNotional(row: CopytradeState["positionRows"][number]) {
  return round(Math.abs(deltaShares(row)) * row.midCents / 100, 2);
}

function lexNotional(row: CopytradeState["positionRows"][number]) {
  return round(row.lexNetShares * row.midCents / 100, 1);
}

function executionStatus(row: CopytradeEvaluatedRow) {
  if (row.action === "BUY" || row.action === "SELL") {
    return state.mode === "paper" || state.mode === "real" ? "EXECUTING" : "READY";
  }
  return row.status;
}

function evaluateRow(row: CopytradeState["positionRows"][number]): CopytradeEvaluatedRow {
  const myTargetShares = sharesTarget(row);
  const delta = deltaShares(row);
  const notional = deltaNotional(row);
  const limitBreached = isLimitBreached();
  const quietGateCleared = row.quietWindowLeftSec === 0 || notional >= state.config.forceRebalanceNotionalUsd;
  const canBuy = !limitBreached;

  let action: CopytradeEvaluatedRow["action"] = "HOLD";
  let status: CopytradeEvaluatedRow["status"] = "WAITING";
  let reason = "Queue is waiting for a clearer execution window.";

  if (row.signalAgeSec > state.config.maxSignalAgeSec) {
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

function getRows() {
  return state.positionRows.map(evaluateRow);
}

function pendingRebalances(rows: CopytradeEvaluatedRow[]) {
  return rows.filter((row) => row.status === "READY" || row.status === "WAITING").length;
}

function systemStates(rows: CopytradeEvaluatedRow[]): CopytradeSystemState[] {
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
      active: rows.some((row) => row.signalAgeSec > state.config.maxSignalAgeSec),
      value: rows.some((row) => row.signalAgeSec > state.config.maxSignalAgeSec) ? "ACTIVE" : "CLEAR",
      note: rows.some((row) => row.signalAgeSec > state.config.maxSignalAgeSec)
        ? "One or more targets exceeded maxSignalAgeSec and are blocked."
        : "All visible rows are still inside the configured freshness window.",
      tone: rows.some((row) => row.signalAgeSec > state.config.maxSignalAgeSec) ? "bad" : "good",
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
  state.bot.lastSyncAt = new Date().toISOString();
  if (state.mode === "paused") {
    state.bot.runtime = "paused";
  } else if (state.bot.runtime === "paused") {
    state.bot.runtime = "running";
  }
}

export function getCopytradeSnapshot(): CopytradeSnapshot {
  const rows = getRows();
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
    decisionLog: rows,
    executionLog: rows,
    riskBars: {
      totalExposureUsd: state.follower.totalExposure,
      maxTotalExposureUsd: state.config.maxTotalExposure,
      freeBudgetUsd: freeBudget(),
      pendingRebalances: pendingRebalances(rows),
      pendingRebalancesCapacity: 8,
      realizedPnlUsd: state.stats.realizedPnl,
      unrealizedPnlUsd: state.stats.unrealizedPnl,
      mtmPnlUsd: state.stats.mtmPnl,
      limitBreached: isLimitBreached(),
    },
  });
}

export function getCopytradeState() {
  return structuredClone(state);
}

export function updateCopytradeConfig(input: unknown) {
  const patch: CopytradeConfigPatch = copytradeConfigPatchSchema.parse(input);
  Object.assign(state.config, patch);
  touchSync();
  return getCopytradeSnapshot();
}

export function setCopytradeMode(input: unknown) {
  const { mode } = copytradeModeBodySchema.parse(input);
  state.mode = mode;
  state.bot.runtime = mode === "paused" ? "paused" : "running";
  if (mode !== "paused") {
    state.bot.pausedReason = null;
  }
  touchSync();
  return getCopytradeSnapshot();
}

export function pauseCopytrade(input: unknown) {
  const { reason } = copytradePauseBodySchema.parse(input ?? {});
  state.mode = "paused";
  state.bot.runtime = "paused";
  state.bot.pausedReason = reason ?? "Paused from dashboard control";
  touchSync();
  return getCopytradeSnapshot();
}

export function resumeCopytrade() {
  state.mode = "dry-run";
  state.bot.runtime = "running";
  state.bot.pausedReason = null;
  touchSync();
  return getCopytradeSnapshot();
}

export function resetCopytradeState() {
  Object.assign(state, structuredClone(initialState));
}

export function getCopytradeMode(): CopytradeMode {
  return state.mode;
}
