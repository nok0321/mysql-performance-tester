/**
 * API Client - バックエンド REST API への fetch ラッパー
 * すべての API 呼び出しはここを経由する
 */

const BASE_URL = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.data;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);
const del = (path) => request('DELETE', path);

// ─── Connections ───────────────────────────────────────────────────────────
export const connectionsApi = {
  list: () => get('/connections'),
  create: (data) => post('/connections', data),
  update: (id, data) => put(`/connections/${id}`, data),
  remove: (id) => del(`/connections/${id}`),
  test: (id) => post(`/connections/${id}/test`)
};

// ─── SQL Library ───────────────────────────────────────────────────────────
export const sqlApi = {
  list: (filters = {}) => {
    // undefined / null / 空文字を除いてクエリパラメータを構築
    const cleaned = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const params = new URLSearchParams(cleaned).toString();
    return get(`/sql${params ? '?' + params : ''}`);
  },
  get: (id) => get(`/sql/${id}`),
  categories: () => get('/sql/categories'),
  create: (data) => post('/sql', data),
  update: (id, data) => put(`/sql/${id}`, data),
  remove: (id) => del(`/sql/${id}`)
};

// ─── Tests ─────────────────────────────────────────────────────────────────
export const testsApi = {
  runSingle: (data) => post('/tests/single', data),
  runParallel: (data) => post('/tests/parallel', data),
  listResults: () => get('/tests/results'),
  getResult: (id) => get(`/tests/results/${id}`)
};

// ─── Reports ───────────────────────────────────────────────────────────────
export const reportsApi = {
  list: () => get('/reports'),
  get: (id) => get(`/reports/${id}`),
  exportUrl: (id, format) => `${BASE_URL}/reports/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`
};
