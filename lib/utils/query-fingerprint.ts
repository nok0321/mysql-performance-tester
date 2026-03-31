/**
 * query-fingerprint.ts - Normalize SQL and produce a stable hash
 *
 * The same logical query (differing only in whitespace, casing, or literal
 * values) always maps to the same fingerprint, enabling history tracking
 * across multiple test runs.
 */

import { createHash } from 'crypto';

export interface QueryFingerprint {
  /** SHA-256 hex, first 16 characters */
  hash: string;
  /** Whitespace-collapsed, lowercased, literals-replaced SQL */
  normalized: string;
}

/**
 * Normalize a SQL string for fingerprinting.
 *
 * Steps:
 *  1. Trim leading/trailing whitespace
 *  2. Strip SQL comments (block and line)
 *  3. Replace quoted string literals with `?`
 *  4. Replace numeric literals with `?`
 *  5. Collapse whitespace sequences to a single space
 *  6. Lowercase everything
 *  7. Remove trailing semicolons
 */
function normalizeQuery(sql: string): string {
  let s = sql.trim();

  // Strip block comments /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');

  // Strip line comments -- ... and # ...
  s = s.replace(/--.*/g, ' ');
  s = s.replace(/#.*/g, ' ');

  // Replace single-quoted string literals with ?
  // Handles escaped quotes ('O''Brien' -> ?)
  s = s.replace(/'(?:[^'\\]|\\.)*'/g, '?');

  // Replace double-quoted string literals with ?
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, '?');

  // Replace numeric literals (integers and decimals) with ?
  // Negative sign is not included — it is an operator, not part of the literal
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, '?');

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  // Lowercase
  s = s.toLowerCase();

  // Remove trailing semicolons and trim again
  s = s.replace(/;+\s*$/, '').trim();

  return s;
}

/**
 * Produce a fingerprint for the given SQL text.
 *
 * @param sql - Raw SQL string (may include comments, varying whitespace, etc.)
 * @returns A fingerprint containing a 16-char hex hash and the normalized SQL
 */
export function fingerprintQuery(sql: string): QueryFingerprint {
  const normalized = normalizeQuery(sql);
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return { hash, normalized };
}
