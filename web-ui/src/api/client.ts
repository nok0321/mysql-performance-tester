/**
 * API Client - Backend REST API fetch wrapper
 * All API calls go through this module
 */

import type { ZodType } from 'zod';
import type {
  Connection,
  ConnectionFormData,
  ConnectionTestResult,
  SqlItem,
  SqlFormData,
  SqlFilters,
  ReportSummary,
  ReportDetail,
  QueryFingerprintSummary,
  QueryTimeline,
  HistoryComparison,
  QueryEvent,
  CreateEventInput,
} from '../types';
import {
  ConnectionListSchema,
  ConnectionSchema,
  ConnectionTestResultSchema,
  SqlItemListSchema,
  SqlItemSchema,
  CategoriesSchema,
  TestIdSchema,
  ReportSummaryListSchema,
  QueryFingerprintListSchema,
  QueryTimelineSchema,
  QueryEventSchema,
} from './schemas/index.js';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

const BASE_URL = '/api';

async function request<T>(method: string, path: string, body?: unknown, schema?: ZodType<T>): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);

  let data: ApiResponse<T>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Invalid JSON response from server (HTTP ${res.status})`);
  }

  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  if (schema) {
    const parsed = schema.safeParse(data.data);
    if (!parsed.success) {
      console.warn(`[API] Response validation failed for ${method} ${path}:`, parsed.error.issues);
    }
  }

  return data.data;
}

function get<T>(path: string, schema?: ZodType<T>): Promise<T> {
  return request<T>('GET', path, undefined, schema);
}
function post<T>(path: string, body?: unknown, schema?: ZodType<T>): Promise<T> {
  return request<T>('POST', path, body, schema);
}
function put<T>(path: string, body?: unknown, schema?: ZodType<T>): Promise<T> {
  return request<T>('PUT', path, body, schema);
}
const del = <T>(path: string): Promise<T> => request<T>('DELETE', path);

// ─── Connections ───────────────────────────────────────────────────────────
export const connectionsApi = {
  list: (): Promise<Connection[]> => get('/connections', ConnectionListSchema),
  create: (data: ConnectionFormData): Promise<Connection> => post('/connections', data, ConnectionSchema),
  update: (id: string, data: ConnectionFormData): Promise<Connection> => put(`/connections/${id}`, data, ConnectionSchema),
  remove: (id: string): Promise<void> => del<void>(`/connections/${id}`),
  test: (id: string): Promise<ConnectionTestResult> => post('/connections/' + id + '/test', undefined, ConnectionTestResultSchema),
};

// ─── SQL Library ───────────────────────────────────────────────────────────
export const sqlApi = {
  list: (filters: SqlFilters = {}): Promise<SqlItem[]> => {
    const cleaned = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const params = new URLSearchParams(cleaned as Record<string, string>).toString();
    return get(`/sql${params ? '?' + params : ''}`, SqlItemListSchema);
  },
  get: (id: string): Promise<SqlItem> => get(`/sql/${id}`, SqlItemSchema),
  categories: (): Promise<string[]> => get('/sql/categories', CategoriesSchema),
  create: (data: SqlFormData): Promise<SqlItem> => post('/sql', data, SqlItemSchema),
  update: (id: string, data: SqlFormData): Promise<SqlItem> => put(`/sql/${id}`, data, SqlItemSchema),
  remove: (id: string): Promise<void> => del<void>(`/sql/${id}`),
};

// ─── Tests ─────────────────────────────────────────────────────────────────
export const testsApi = {
  runSingle: (data: unknown): Promise<{ testId: string }> => post('/tests/single', data, TestIdSchema),
  runParallel: (data: unknown): Promise<{ testId: string }> => post('/tests/parallel', data, TestIdSchema),
  runComparison: (data: unknown): Promise<{ testId: string }> => post('/tests/comparison', data, TestIdSchema),
  listResults: (): Promise<unknown[]> => get<unknown[]>('/tests/results'),
  getResult: (id: string): Promise<unknown> => get<unknown>(`/tests/results/${id}`),
};

// ─── Reports ───────────────────────────────────────────────────────────────
export const reportsApi = {
  list: (): Promise<ReportSummary[]> => get('/reports', ReportSummaryListSchema),
  get: (id: string): Promise<ReportDetail> => get<ReportDetail>(`/reports/${id}`),
  exportUrl: (id: string, format: string): string =>
    `${BASE_URL}/reports/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`,
};

// ─── History ──────────────────────────────────────────────────────────────
export const historyApi = {
  fingerprints: (): Promise<QueryFingerprintSummary[]> =>
    get('/history/fingerprints', QueryFingerprintListSchema),
  timeline: (fp: string): Promise<QueryTimeline> =>
    get(`/history/${encodeURIComponent(fp)}`, QueryTimelineSchema),
  compare: (fp: string, before: string, after: string): Promise<HistoryComparison> =>
    get<HistoryComparison>(
      `/history/${encodeURIComponent(fp)}/compare?before=${encodeURIComponent(before)}&after=${encodeURIComponent(after)}`
    ),
  createEvent: (data: CreateEventInput): Promise<QueryEvent> =>
    post('/history/events', data, QueryEventSchema),
  deleteEvent: (id: string): Promise<void> =>
    del<void>(`/history/events/${id}`),
};
