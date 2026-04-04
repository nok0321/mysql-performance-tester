import { z } from 'zod';

export const ReportSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  testName: z.string().optional(),
  createdAt: z.string(),
}).passthrough();

export const ReportSummaryListSchema = z.array(ReportSummarySchema);
