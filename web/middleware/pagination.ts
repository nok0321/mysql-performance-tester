/**
 * pagination.ts - Shared pagination helper for API routes
 */

import type { Request } from 'express';

/** Default and maximum page size */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Pagination metadata included in responses */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

/** Paginated response shape */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Extract limit and offset from query parameters.
 * Clamps limit to [1, MAX_LIMIT] and offset to [0, Infinity).
 */
export function parsePagination(req: Request): { limit: number; offset: number } {
  const rawLimit = req.query.limit;
  const rawOffset = req.query.offset;

  let limit = rawLimit ? Number(rawLimit) : DEFAULT_LIMIT;
  let offset = rawOffset ? Number(rawOffset) : 0;

  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  return { limit, offset };
}

/**
 * Apply pagination to a sorted array and return the paginated response.
 */
export function paginate<T>(items: T[], limit: number, offset: number): PaginatedResponse<T> {
  return {
    success: true,
    data: items.slice(offset, offset + limit),
    pagination: {
      total: items.length,
      limit,
      offset,
    },
  };
}
