/**
 * EventsStore - SQLite persistence for query timeline events
 * Stores event annotations (e.g., "index added") for performance tracking.
 */

import { randomUUID } from 'crypto';
import { getDb } from './database.js';
import type { QueryEvent, QueryEventType } from '../../lib/types/index.js';

/** Input for creating a new event */
export interface CreateEventInput {
  queryFingerprint: string;
  label: string;
  type: QueryEventType;
  timestamp?: string;
}

/** SQLite row shape */
interface EventRow {
  id: string;
  query_fingerprint: string;
  label: string;
  type: string;
  timestamp: string;
  created_at: string;
}

/** Map a SQLite row to a QueryEvent */
function rowToEvent(row: EventRow): QueryEvent {
  return {
    id:               row.id,
    queryFingerprint: row.query_fingerprint,
    label:            row.label,
    type:             row.type as QueryEventType,
    timestamp:        row.timestamp,
    createdAt:        row.created_at,
  };
}

/**
 * List events for a given query fingerprint
 */
export async function listByFingerprint(fingerprint: string): Promise<QueryEvent[]> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM query_events WHERE query_fingerprint = ? ORDER BY timestamp ASC'
  ).all(fingerprint) as EventRow[];
  return rows.map(rowToEvent);
}

/**
 * Create a new event
 */
export async function create(input: CreateEventInput): Promise<QueryEvent> {
  const db = getDb();
  const now = new Date().toISOString();
  const event: QueryEvent = {
    id:               `evt_${randomUUID()}`,
    queryFingerprint: input.queryFingerprint,
    label:            input.label,
    type:             input.type,
    timestamp:        input.timestamp || now,
    createdAt:        now,
  };

  db.prepare(`
    INSERT INTO query_events (id, query_fingerprint, label, type, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(event.id, event.queryFingerprint, event.label, event.type, event.timestamp, event.createdAt);

  return event;
}

/**
 * Remove an event by ID
 */
export async function remove(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare('DELETE FROM query_events WHERE id = ?').run(id);
  return result.changes > 0;
}
