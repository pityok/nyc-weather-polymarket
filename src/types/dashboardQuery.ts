import { z } from "zod";

export const dashboardSnapshotQuerySchema = z.object({
  runId: z.string().optional(),
  includeHistory: z.coerce.boolean().default(false),
  historyLimit: z.coerce.number().int().min(1).max(50).default(10),
});

export type DashboardSnapshotQuery = z.infer<typeof dashboardSnapshotQuerySchema>;
