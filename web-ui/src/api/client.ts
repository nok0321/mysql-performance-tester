/**
 * API Client - Backend REST API fetch wrapper
 * All API calls go through this module
 */

import type {
  Connection,
  ConnectionFormData,
  ConnectionTestResult,
  SqlItem,
  SqlFormData,
  SqlFilters,
  ReportSummary,
  ReportDetail,
} from '../types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

const BASE_URL = '/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data: ApiResponse<T> = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.data;
}

const get = <T>(path: string): Promise<T> => request<T>('GET', path);
const post = <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body);
const put = <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body);
const del = <T>(path: string): Promise<T> => request<T>('DELETE', path);

// ─── Connections ───────────────────────────────────────────────────────────
export const connectionsApi = {
  list: (): Promise<Connection[]> => get<Connection[]>('/connections'),
  create: (data: ConnectionFormData): Promise<Connection> => post<Connection>('/connections', data),
  update: (id: string, data: ConnectionFormData): Promise<Connection> => put<Connection>(`/connections/${id}`, data),
  remove: (id: string): Promise<void> => del<void>(`/connections/${id}`),
  test: (id: string): Promise<ConnectionTestResult> => post<ConnectionTestResult>(`/connections/${id}/test`),
};

// ─── SQL Library ───────────────────────────────────────────────────────────
export const sqlApi = {
  list: (filters: SqlFilters = {}): Promise<SqlItem[]> => {
    const cleaned = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const params = new URLSearchParams(cleaned as Record<string, string>).toString();
    return get<SqlItem[]>(`/sql${params ? '?' + params : ''}`);
  },
  get: (id: string): Promise<SqlItem> => get<SqlItem>(`/sql/${id}`),
  categories: (): Promise<string[]> => get<string[]>('/sql/categories'),
  create: (data: SqlFormData): Promise<SqlItem> => post<SqlItem>('/sql', data),
  update: (id: string, data: SqlFormData): Promise<SqlItem> => put<SqlItem>(`/sql/${id}`, data),
  remove: (id: string): Promise<void> => del<void>(`/sql/${id}`),
};

// ─── Tests ─────────────────────────────────────────────────────────────────
export const testsApi = {
  runSingle: (data: unknown): Promise<{ testId: string }> => post<{ testId: string }>('/tests/single', data),
  runParallel: (data: unknown): Promise<{ testId: string }> => post<{ testId: string }>('/tests/parallel', data),
  listResults: (): Promise<unknown[]> => get<unknown[]>('/tests/results'),
  getResult: (id: string): Promise<unknown> => get<unknown>(`/tests/results/${id}`),
};

// ─── Reports ───────────────────────────────────────────────────────────────
export const reportsApi = {
  list: (): Promise<ReportSummary[]> => get<ReportSummary[]>('/reports'),
  get: (id: string): Promise<ReportDetail> => get<ReportDetail>(`/reports/${id}`),
  exportUrl: (id: string, format: string): string =>
    `${BASE_URL}/reports/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`,
};
