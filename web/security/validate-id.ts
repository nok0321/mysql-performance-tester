/**
 * validate-id.ts - Route parameter ID validation
 *
 * ID patterns:
 *   connections: conn_<timestamp>
 *   sql:         sql_<timestamp>
 *   test results: test_<timestamp>_<random> | parallel_<timestamp>_<random>
 *   batch results: <timestamp> (digits only)
 *
 * Allowed characters: alphanumeric, underscore, hyphen only
 * Maximum length: 200 characters
 */

import type { Response } from 'express';

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
const MAX_ID_LENGTH   = 200;

/** Error with an HTTP status code for Express error middleware */
export interface HttpError extends Error {
  status: number;
}

/**
 * Validate an ID and return the safe value.
 * Throws on invalid input.
 */
export function validateId(id: string, label = 'ID'): string {
  if (!id || typeof id !== 'string') {
    throw Object.assign(new Error(`${label}が指定されていません`), { status: 400 }) as HttpError;
  }
  if (id.length > MAX_ID_LENGTH) {
    throw Object.assign(new Error(`${label}が長すぎます`), { status: 400 }) as HttpError;
  }
  if (!SAFE_ID_PATTERN.test(id)) {
    throw Object.assign(new Error(`不正な${label}です`), { status: 400 }) as HttpError;
  }
  return id;
}

/**
 * Convert a validateId error into an Express JSON response.
 */
export function handleIdError(err: HttpError | Error, res: Response): void {
  const status = (err as HttpError).status || 500;
  res.status(status).json({ success: false, error: err.message });
}
