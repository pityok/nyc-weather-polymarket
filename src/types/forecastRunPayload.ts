import { z } from "zod";

const dateLike = z.coerce.date();

export const runSchema = z.object({
  runTimeUtc: dateLike,
  runTimeMsk: dateLike,
  targetDate: dateLike,
  horizon: z.enum(["today", "tomorrow", "day2"]),
});

export const modelForecastSchema = z.object({
  modelId: z.string().min(1),
  modelName: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  rawResponse: z.unknown(),
  probsJson: z.record(z.number()),
  sumBeforeNormalization: z.number(),
});

export const consensusSchema = z.object({
  method: z.enum(["simple", "weighted"]),
  probsJson: z.record(z.number()),
});

export const edgeSignalSchema = z.object({
  targetDate: dateLike,
  rangeKey: z.string().min(1),
  aiProb: z.number(),
  marketProb: z.number(),
  edge: z.number(),
  recommendation: z.enum(["bet", "no_bet"]),
  reason: z.string().min(1),
});

export const marketSnapshotSchema = z.object({
  targetDate: dateLike,
  snapshotTimeUtc: dateLike,
  snapshotType: z.enum(["current", "fixed_1800_msk"]),
  probsJson: z.record(z.number()),
  source: z.string().min(1),
});

export const createForecastRunPayloadSchema = z.object({
  run: runSchema,
  modelForecasts: z.array(modelForecastSchema),
  consensuses: z.array(consensusSchema),
  edgeSignals: z.array(edgeSignalSchema),
  marketSnapshot: marketSnapshotSchema.optional(),
});

export type CreateForecastRunPayload = z.infer<typeof createForecastRunPayloadSchema>;
