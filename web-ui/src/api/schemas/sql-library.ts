import { z } from 'zod';

export const SqlItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  sql: z.string(),
  category: z.string(),
  description: z.string(),
  tags: z.string().optional(),
  updatedAt: z.string(),
  createdAt: z.string(),
}).passthrough();

export const SqlItemListSchema = z.array(SqlItemSchema);

export const CategoriesSchema = z.array(z.string());
