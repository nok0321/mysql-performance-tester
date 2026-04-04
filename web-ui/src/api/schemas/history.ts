import { z } from 'zod';

export const QueryFingerprintSummarySchema = z.object({
  queryFingerprint: z.string(),
  queryText: z.string(),
  latestTestName: z.string(),
  runCount: z.number(),
  latestRunAt: z.string(),
}).passthrough();

export const QueryFingerprintListSchema = z.array(QueryFingerprintSummarySchema);

export const QueryEventSchema = z.object({
  id: z.string(),
  queryFingerprint: z.string(),
  label: z.string(),
  type: z.string(),
  timestamp: z.string(),
}).passthrough();

export const QueryTimelineSchema = z.object({
  queryFingerprint: z.string(),
  queryText: z.string(),
  entries: z.array(z.object({
    testId: z.string(),
    testName: z.string(),
    timestamp: z.string(),
    statistics: z.record(z.string(), z.unknown()),
    explainAccessType: z.string().optional(),
  }).passthrough()),
  events: z.array(QueryEventSchema),
}).passthrough();
