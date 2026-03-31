/**
 * EventsStore - JSON file persistence for query timeline events
 * Saves event annotations (e.g., "index added") in web/data/query-events.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import type { QueryEvent, QueryEventType } from '../../lib/types/index.js';

// In-process mutex to prevent write conflicts
let _lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = _lock.then(fn);
  _lock = next.catch(() => {});
  return next;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'query-events.json');

async function writeAtomic(filePath: string, data: QueryEvent[]): Promise<void> {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

async function safeReadJson(filePath: string): Promise<QueryEvent[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw) as QueryEvent[];
  } catch {
    const backup = `${filePath}.corrupt_${Date.now()}`;
    await fs.rename(filePath, backup).catch(() => {});
    console.error(`[EventsStore] JSON parse failed. Backed up to ${backup}. Resetting.`);
    await fs.writeFile(filePath, '[]', 'utf8').catch(() => {});
    return [];
  }
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

/** Input for creating a new event */
export interface CreateEventInput {
  queryFingerprint: string;
  label: string;
  type: QueryEventType;
  timestamp?: string;
}

/**
 * List events for a given query fingerprint
 */
export async function listByFingerprint(fingerprint: string): Promise<QueryEvent[]> {
  await ensureStore();
  const items = await safeReadJson(STORE_FILE);
  return items
    .filter(e => e.queryFingerprint === fingerprint)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Create a new event
 */
export function create(input: CreateEventInput): Promise<QueryEvent> {
  return withLock(async () => {
    await ensureStore();
    const items = await safeReadJson(STORE_FILE);

    const newItem: QueryEvent = {
      id: `evt_${randomUUID()}`,
      queryFingerprint: input.queryFingerprint,
      label: input.label,
      type: input.type,
      timestamp: input.timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    items.push(newItem);
    await writeAtomic(STORE_FILE, items);
    return newItem;
  });
}

/**
 * Remove an event by ID
 */
export function remove(id: string): Promise<boolean> {
  return withLock(async () => {
    await ensureStore();
    const items = await safeReadJson(STORE_FILE);
    const index = items.findIndex(e => e.id === id);
    if (index === -1) return false;
    items.splice(index, 1);
    await writeAtomic(STORE_FILE, items);
    return true;
  });
}
