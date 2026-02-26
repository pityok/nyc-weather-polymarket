import { z } from "zod";

export const listForecastRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const summaryQuerySchema = z.object({
  runId: z.string().optional(),
});

export type ListForecastRunsQuery = z.infer<typeof listForecastRunsQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
