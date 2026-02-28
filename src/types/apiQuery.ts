import { z } from "zod";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const apiSummaryQuerySchema = z.object({
  date: ymd,
});

export const runsQuerySchema = z.object({
  date: ymd,
});

export const marketQuerySchema = z.object({
  date: ymd,
  type: z.enum(["current", "fixed_1800_msk"]),
});

export const signalsQuerySchema = z.object({
  date: ymd,
});

export const backtestQuerySchema = z.object({
  from: ymd,
  to: ymd,
});

export const apiSummaryResponseSchema = z.object({
  date: ymd,
  forecasts: z.array(z.unknown()),
  consensus: z.array(z.unknown()),
  market: z.object({
    current: z.unknown().nullable(),
    fixed_1800_msk: z.unknown().nullable(),
  }),
  marketMeta: z
    .object({
      currentSource: z.unknown().nullable(),
      fixedSource: z.unknown().nullable(),
      currentSnapshotTime: z.unknown().nullable(),
      fixedSnapshotTime: z.unknown().nullable(),
    })
    .optional(),
  signals: z.array(z.unknown()),
});
