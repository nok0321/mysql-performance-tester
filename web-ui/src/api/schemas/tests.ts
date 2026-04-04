import { z } from 'zod';

export const TestIdSchema = z.object({
  testId: z.string(),
}).passthrough();
