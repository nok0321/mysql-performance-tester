import { z } from 'zod';

export const ConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  database: z.string(),
  user: z.string(),
  passwordMasked: z.string(),
  poolSize: z.number(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const ConnectionTestResultSchema = z.object({
  connected: z.boolean().optional(),
  serverVersion: z.string().optional(),
  supportsExplainAnalyze: z.boolean().optional(),
}).passthrough();

export const ConnectionListSchema = z.array(ConnectionSchema);
