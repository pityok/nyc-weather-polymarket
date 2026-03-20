import { z } from "zod";

export const copytradeModeSchema = z.enum(["observer", "dry-run", "paper", "real", "paused"]);
export type CopytradeMode = z.infer<typeof copytradeModeSchema>;

export const copytradeActionSchema = z.enum(["BUY", "SELL", "HOLD", "SKIP"]);
export type CopytradeAction = z.infer<typeof copytradeActionSchema>;

export const copytradeStatusSchema = z.enum(["READY", "WAITING", "BLOCKED", "EXECUTING"]);
export type CopytradeStatus = z.infer<typeof copytradeStatusSchema>;

export const copytradeRuntimeSchema = z.enum(["running", "loading", "paused"]);
export type CopytradeRuntime = z.infer<typeof copytradeRuntimeSchema>;

export const copytradeHealthSchema = z.enum(["ok", "warn", "error"]);
export type CopytradeHealth = z.infer<typeof copytradeHealthSchema>;

export const copytradeConfigSchema = z.object({
  scale: z.number().positive(),
  minTradeNotionalUsd: z.number().nonnegative(),
  forceRebalanceNotionalUsd: z.number().nonnegative(),
  quietWindowSec: z.number().int().nonnegative(),
  rebalanceWindowSec: z.number().int().positive(),
  maxSignalAgeSec: z.number().int().positive(),
  maxSlippagePct: z.number().nonnegative(),
  maxPriceDriftPct: z.number().nonnegative(),
  maxTotalExposure: z.number().nonnegative(),
  maxMarketExposure: z.number().nonnegative(),
  copyEntries: z.boolean(),
  copyExits: z.boolean(),
  copyNoSide: z.boolean(),
  skipWideMarket: z.boolean(),
  respectCooldown: z.boolean(),
  weatherOnly: z.boolean(),
});
export type CopytradeConfig = z.infer<typeof copytradeConfigSchema>;

export const copytradeConfigPatchSchema = copytradeConfigSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one config field must be provided",
  });
export type CopytradeConfigPatch = z.infer<typeof copytradeConfigPatchSchema>;

export const copytradeBotSchema = z.object({
  runtime: copytradeRuntimeSchema,
  health: copytradeHealthSchema,
  lastSyncAt: z.string().datetime(),
  lagSec: z.number().nonnegative(),
  pausedReason: z.string().nullable(),
});
export type CopytradeBot = z.infer<typeof copytradeBotSchema>;

export const copytradeLeaderSchema = z.object({
  name: z.string().min(1),
  wallet: z.string().min(1),
  activity24h: z.number().int().nonnegative(),
  weatherActivity24h: z.number().int().nonnegative(),
});
export type CopytradeLeader = z.infer<typeof copytradeLeaderSchema>;

export const copytradeFollowerSchema = z.object({
  wallet: z.string().min(1),
  totalExposure: z.number().nonnegative(),
});
export type CopytradeFollower = z.infer<typeof copytradeFollowerSchema>;

export const copytradeStatsSchema = z.object({
  processed24h: z.number().int().nonnegative(),
  skipped24h: z.number().int().nonnegative(),
  held24h: z.number().int().nonnegative(),
  trackingErrorPct: z.number().nonnegative(),
  avgSlippagePct: z.number().nonnegative(),
  realizedPnl: z.number(),
  unrealizedPnl: z.number(),
  mtmPnl: z.number(),
});
export type CopytradeStats = z.infer<typeof copytradeStatsSchema>;

export const copytradeLeaderEventSchema = z.object({
  market: z.string().min(1),
  outcome: z.string().min(1),
  action: copytradeActionSchema.exclude(["HOLD", "SKIP"]),
  sizeUsd: z.number().positive(),
  priceCents: z.number().positive(),
  signalAgeSec: z.number().int().nonnegative(),
  txHash: z.string().min(1),
  group: z.string().min(1),
  partialFills: z.number().int().nonnegative(),
  note: z.string().min(1),
  tone: z.enum(["good", "warn", "bad"]),
});
export type CopytradeLeaderEvent = z.infer<typeof copytradeLeaderEventSchema>;

export const copytradePositionRowSchema = z.object({
  conditionId: z.string().min(1),
  market: z.string().min(1),
  outcome: z.string().min(1),
  lexNetShares: z.number().nonnegative(),
  myCurrentShares: z.number().nonnegative(),
  midCents: z.number().positive(),
  bestBidCents: z.number().positive(),
  bestAskCents: z.number().positive(),
  avgEntryCents: z.number().positive(),
  signalAgeSec: z.number().int().nonnegative(),
  partialFillCount: z.number().int().nonnegative(),
  quietWindowLeftSec: z.number().int().nonnegative(),
  depthUsd: z.number().nonnegative(),
  wideMarket: z.boolean(),
  driftBlocked: z.boolean(),
  decisionTime: z.string().min(1),
  executionTime: z.string().min(1),
  executionPhase: z.string().min(1),
  unrealizedPnlUsd: z.number(),
});
export type CopytradePositionRow = z.infer<typeof copytradePositionRowSchema>;

export const copytradeDecisionCheckSchema = z.object({
  label: z.string().min(1),
  ok: z.boolean(),
});
export type CopytradeDecisionCheck = z.infer<typeof copytradeDecisionCheckSchema>;

export const copytradeEvaluatedRowSchema = copytradePositionRowSchema.extend({
  myTargetShares: z.number(),
  deltaShares: z.number(),
  deltaNotional: z.number(),
  lexNetNotional: z.number(),
  action: copytradeActionSchema,
  status: copytradeStatusSchema,
  reason: z.string().min(1),
  executionStatus: copytradeStatusSchema,
  lastLeaderActivitySec: z.number().int().nonnegative(),
  checks: z.array(copytradeDecisionCheckSchema),
});
export type CopytradeEvaluatedRow = z.infer<typeof copytradeEvaluatedRowSchema>;

export const copytradeSystemStateSchema = z.object({
  name: z.enum(["loading", "stale data", "sync error", "api lagging", "no positions", "execution paused"]),
  active: z.boolean(),
  value: z.enum(["ACTIVE", "STANDBY", "CLEAR"]),
  note: z.string().min(1),
  tone: z.enum(["good", "warn", "bad"]),
});
export type CopytradeSystemState = z.infer<typeof copytradeSystemStateSchema>;

export const copytradeRiskBarsSchema = z.object({
  totalExposureUsd: z.number().nonnegative(),
  maxTotalExposureUsd: z.number().nonnegative(),
  freeBudgetUsd: z.number().nonnegative(),
  pendingRebalances: z.number().int().nonnegative(),
  pendingRebalancesCapacity: z.number().int().positive(),
  realizedPnlUsd: z.number(),
  unrealizedPnlUsd: z.number(),
  mtmPnlUsd: z.number(),
  limitBreached: z.boolean(),
});
export type CopytradeRiskBars = z.infer<typeof copytradeRiskBarsSchema>;

export const copytradeStateSchema = z.object({
  mode: copytradeModeSchema,
  bot: copytradeBotSchema,
  leader: copytradeLeaderSchema,
  follower: copytradeFollowerSchema,
  config: copytradeConfigSchema,
  stats: copytradeStatsSchema,
  leaderEvents: z.array(copytradeLeaderEventSchema),
  positionRows: z.array(copytradePositionRowSchema),
});
export type CopytradeState = z.infer<typeof copytradeStateSchema>;

export const copytradeModeBodySchema = z.object({
  mode: copytradeModeSchema,
});
export type CopytradeModeBody = z.infer<typeof copytradeModeBodySchema>;

export const copytradePauseBodySchema = z.object({
  reason: z.string().trim().min(1).max(280).optional(),
});
export type CopytradePauseBody = z.infer<typeof copytradePauseBodySchema>;

export interface CopytradeSnapshot {
  mode: CopytradeMode;
  bot: CopytradeBot;
  leader: CopytradeLeader;
  follower: CopytradeFollower & { freeBudget: number };
  config: CopytradeConfig;
  stats: CopytradeStats & { pendingRebalances: number; openPositions: number };
  latestDecision: {
    market: string;
    outcome: string;
    action: CopytradeAction;
    status: CopytradeStatus;
    reason: string;
  } | null;
  systemStates: CopytradeSystemState[];
  leaderEvents: CopytradeLeaderEvent[];
  rebalanceQueue: CopytradeEvaluatedRow[];
  targetState: CopytradeEvaluatedRow[];
  aggregationState: CopytradeEvaluatedRow[];
  decisionTrace: CopytradeEvaluatedRow[];
  positions: CopytradeEvaluatedRow[];
  markets: CopytradeEvaluatedRow[];
  decisionLog: CopytradeEvaluatedRow[];
  executionLog: CopytradeEvaluatedRow[];
  riskBars: CopytradeRiskBars;
}
