# REST API Reference

## Base URL

```
http://localhost:3001/api
```

## Authentication

- **REST API**: No authentication required (localhost-only tool)
- **WebSocket**: Token-based authentication (see [WebSocket Protocol](#websocket-protocol))

## Common Response Format

All endpoints return JSON with this structure:

```json
{
  "success": true,
  "data": <T>,
  "error": "Error message (only when success=false)",
  "pagination": { "total": 100, "limit": 20, "offset": 0 }
}
```

## Pagination

Endpoints that return lists support pagination via query parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit`   | 20      | Items per page (max 100) |
| `offset`  | 0       | Number of items to skip  |

---

## Connections

Manage MySQL connection configurations. Passwords are encrypted at rest (AES-256-GCM).

### GET /api/connections

List all saved connections. Passwords are masked in the response.

**Response:** `Connection[]`

```json
{
  "success": true,
  "data": [
    {
      "id": "conn_abc123",
      "name": "Production DB",
      "host": "192.168.1.100",
      "port": 3306,
      "database": "mydb",
      "user": "admin",
      "passwordMasked": "••••••••",
      "poolSize": 10,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST /api/connections

Create a new connection.

**Request Body:**

| Field      | Type   | Required | Default     |
|------------|--------|----------|-------------|
| `host`     | string | Yes      |             |
| `database` | string | Yes      |             |
| `user`     | string | Yes      |             |
| `name`     | string | No       | Auto-generated ("Connection N") |
| `port`     | number | No       | 3306        |
| `password` | string | No       | ""          |
| `poolSize` | number | No       | 10          |

**Response:** `201 Created` with the created `Connection`

**Errors:**
- `400` — Missing required fields (`host`, `database`, `user`)

### PUT /api/connections/:id

Update an existing connection.

**Request Body:** Partial — only include fields to update.

| Field      | Type   |
|------------|--------|
| `name`     | string |
| `host`     | string |
| `port`     | number |
| `database` | string |
| `user`     | string |
| `password` | string |
| `poolSize` | number |

**Response:** `200` with updated `Connection`

**Errors:**
- `400` — Invalid connection ID format
- `404` — Connection not found

### DELETE /api/connections/:id

Delete a connection.

**Response:** `200` with `{ success: true }`

**Errors:**
- `404` — Connection not found

### POST /api/connections/:id/test

Test connectivity to a MySQL server (executes `SELECT 1`).

**Rate Limit:** 10 requests per minute

**Response:**

```json
{
  "success": true,
  "data": {
    "connected": true,
    "serverVersion": "8.0.36",
    "supportsExplainAnalyze": true
  }
}
```

**Errors:**
- `404` — Connection not found
- `503` — Connection to MySQL failed

---

## SQL Library

Manage reusable SQL snippets for testing.

### GET /api/sql

List SQL snippets with optional filtering.

**Query Parameters:**

| Parameter  | Type   | Description                      |
|------------|--------|----------------------------------|
| `category` | string | Filter by exact category name    |
| `keyword`  | string | Search in name, sql, description |

**Response:** `SqlItem[]`

```json
{
  "success": true,
  "data": [
    {
      "id": "sql_abc123",
      "name": "User Count",
      "sql": "SELECT COUNT(*) FROM users",
      "category": "analytics",
      "description": "Count all users",
      "tags": "[\"perf\",\"users\"]",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /api/sql/categories

List distinct categories.

**Response:** `string[]`

```json
{ "success": true, "data": ["analytics", "debug", "perf"] }
```

### GET /api/sql/:id

Get a specific SQL snippet.

**Errors:**
- `404` — SQL snippet not found

### POST /api/sql

Create a SQL snippet.

**Request Body:**

| Field         | Type     | Required | Default        |
|---------------|----------|----------|----------------|
| `sql`         | string   | Yes      |                |
| `name`        | string   | No       | "Untitled SQL" |
| `category`    | string   | No       | ""             |
| `description` | string   | No       | ""             |
| `tags`        | string[] | No       | []             |

**Response:** `201 Created` with the created `SqlItem`

**Errors:**
- `400` — `sql` is empty or missing
- `400` — `sql` exceeds 100KB limit

### PUT /api/sql/:id

Update a SQL snippet. Partial updates supported.

**Errors:**
- `400` — Updated `sql` exceeds 100KB limit
- `404` — SQL snippet not found

### DELETE /api/sql/:id

Delete a SQL snippet.

**Errors:**
- `404` — SQL snippet not found

---

## Tests

Execute performance tests and retrieve results.

**Rate Limit:** 10 requests per minute (all test execution endpoints)

**Concurrency:** Max 3 concurrent tests (configurable via `MAX_CONCURRENT_TESTS` env var). Returns `429` when exceeded.

### POST /api/tests/single

Execute a single-query performance test.

**Request Body:**

| Field                         | Type    | Required | Default         |
|-------------------------------|---------|----------|-----------------|
| `connectionId`                | string  | Yes      |                 |
| `sqlText`                     | string  | Yes      |                 |
| `testName`                    | string  | No       | "Web UI Test"   |
| `testIterations`              | number  | No       | 20 (max 10000)  |
| `enableWarmup`                | boolean | No       | true            |
| `warmupPercentage`            | number  | No       | 20              |
| `removeOutliers`              | boolean | No       | false           |
| `outlierMethod`               | string  | No       | "iqr"           |
| `enableExplainAnalyze`        | boolean | No       | true            |
| `enableOptimizerTrace`        | boolean | No       | false           |
| `enableBufferPoolMonitoring`  | boolean | No       | true            |
| `enablePerformanceSchema`     | boolean | No       | false           |

**Response:** `202 Accepted` — test executes asynchronously

```json
{ "success": true, "data": { "testId": "test_<uuid>" } }
```

Results are delivered via WebSocket (`progress` → `complete` or `error`).

**Errors:**
- `400` — Missing or empty `sqlText`
- `400` — SQL validation failure (e.g., `DROP`, `DELETE` without WHERE)
- `404` — Connection not found
- `429` — Rate limit or concurrent test limit exceeded

### POST /api/tests/parallel

Execute a parallel load test.

**Request Body:** Same as single test, plus:

| Field                | Type     | Required | Default       |
|----------------------|----------|----------|---------------|
| `parallelThreads`    | number   | No       | 5 (max 200)   |
| `parallelDirectory`  | string   | No       | "./parallel"  |
| `sqlIds`             | string[] | No       | (use directory mode) |

**Modes:**
- **Directory mode** (default): Reads `.sql` files from `parallelDirectory`
- **SQL Library mode**: When `sqlIds` is provided, uses SQL snippets from the library (max 50)

**Response:** `202 Accepted` with `{ testId: "parallel_<uuid>" }`

**Errors:**
- `400` — Invalid directory path (absolute paths and traversal rejected)
- `400` — More than 50 SQL IDs
- `404` — Connection not found
- `429` — Rate limit or concurrent test limit exceeded

### POST /api/tests/comparison

Execute an A/B comparison test.

**Request Body:** Same as single test, plus:

| Field           | Type   | Required | Default      |
|-----------------|--------|----------|--------------|
| `sqlTextA`      | string | Yes      |              |
| `sqlTextB`      | string | Yes      |              |
| `testNameA`     | string | No       | "Query A"    |
| `testNameB`     | string | No       | "Query B"    |
| `executionMode` | string | No       | "sequential" |

`executionMode`: `"sequential"` (single connection, A then B) or `"parallel"` (two independent connections).

**Response:** `202 Accepted` with `{ testId: "comparison_<uuid>" }`

### GET /api/tests/results

List past test results (paginated from SQLite store).

**Response:**

```json
{
  "success": true,
  "data": [
    { "id": "test_abc", "fileName": "test_abc.json", "createdAt": "...", "size": 12345 }
  ],
  "pagination": { "total": 50, "limit": 20, "offset": 0 }
}
```

### GET /api/tests/results/:id

Get individual test result JSON.

**Errors:**
- `404` — Result file not found

---

## Reports

View and export test results.

### GET /api/reports

List reports (paginated from SQLite store).

**Query Parameters:**

| Parameter | Type   | Description                            |
|-----------|--------|----------------------------------------|
| `type`    | string | Filter by type: single, parallel, comparison, batch |
| `limit`   | number | Items per page (default 20)            |
| `offset`  | number | Number of items to skip                |

**Response:** `ReportSummary[]`

```json
{
  "success": true,
  "data": [
    { "id": "test_abc", "type": "single", "testName": "My Test", "createdAt": "...", "size": 12345 }
  ],
  "pagination": { "total": 50, "limit": 20, "offset": 0 }
}
```

### GET /api/reports/:id

Get individual report JSON. Supports both single result files and batch directories.

**Errors:**
- `404` — Report not found

### GET /api/reports/:id/export

Export a report in various formats.

**Query Parameters:**

| Parameter | Values                              | Default |
|-----------|-------------------------------------|---------|
| `format`  | json, csv, html, markdown, excel    | json    |

**Response:** File download with appropriate Content-Type and Content-Disposition headers.

**Errors:**
- `400` — Unsupported format

---

## History

Query history tracking with timeline events and fingerprint-based grouping.

### GET /api/history/fingerprints

List distinct query fingerprints with summary statistics.

**Response:** `QueryFingerprintSummary[]`

```json
{
  "success": true,
  "data": [
    {
      "queryFingerprint": "a1b2c3d4e5f6g7h8",
      "queryText": "SELECT * FROM users WHERE id = ?",
      "latestTestName": "User Query Test",
      "runCount": 15,
      "latestRunAt": "2026-04-01T12:00:00.000Z"
    }
  ],
  "pagination": { "total": 10, "limit": 20, "offset": 0 }
}
```

### GET /api/history/:fingerprint

Get timeline for a specific query (all test runs and events).

**Path Parameter:** `fingerprint` — 16 or 32 character hex string

**Response:**

```json
{
  "success": true,
  "data": {
    "queryFingerprint": "a1b2c3d4e5f6g7h8",
    "queryText": "SELECT * FROM users WHERE id = ?",
    "entries": [
      {
        "testId": "test_abc",
        "testName": "Test Run",
        "timestamp": "2026-04-01T12:00:00.000Z",
        "statistics": { "basic": { "mean": 1.5 }, "percentiles": { "p50": 1.2 } },
        "explainAccessType": "ALL"
      }
    ],
    "events": [
      {
        "id": "evt_abc",
        "queryFingerprint": "a1b2c3d4e5f6g7h8",
        "label": "Added index on users.email",
        "type": "index_added",
        "timestamp": "2026-03-15T10:00:00.000Z"
      }
    ]
  },
  "pagination": { "total": 15, "limit": 20, "offset": 0 }
}
```

**Errors:**
- `400` — Invalid fingerprint format

### GET /api/history/:fingerprint/compare

Compute delta between two test runs.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `before`  | Yes      | testId of the "before" run |
| `after`   | Yes      | testId of the "after" run  |

**Response:**

```json
{
  "success": true,
  "data": {
    "before": { "basic": { "mean": 2.0 } },
    "after": { "basic": { "mean": 1.5 } },
    "delta": {
      "meanDiff": -0.5,
      "meanDiffPercent": -25.0,
      "winner": "B",
      "summary": "Query B is 25.0% faster"
    }
  }
}
```

**Errors:**
- `400` — Missing `before` or `after` parameter
- `400` — Statistics data not found
- `404` — Result file not found

### POST /api/history/events

Create a timeline event (annotation).

**Request Body:**

| Field              | Type   | Required | Description              |
|--------------------|--------|----------|--------------------------|
| `queryFingerprint` | string | Yes      | 16/32 char hex string    |
| `label`            | string | Yes      | Human-readable label     |
| `type`             | string | Yes      | Event type (see below)   |
| `timestamp`        | string | No       | ISO 8601 (default: now)  |

**Event Types:** `index_added`, `index_removed`, `schema_change`, `config_change`, `custom`

**Response:** `201 Created` with the created event

**Errors:**
- `400` — Missing required fields
- `400` — Invalid event type

### DELETE /api/history/events/:id

Delete a timeline event.

**Errors:**
- `404` — Event not found

---

## System

### GET /api/health

Health check endpoint.

**Response:**

```json
{ "status": "ok", "timestamp": "2026-04-01T12:00:00.000Z", "wsClients": 2 }
```

### GET /api/ws-token

Generate a one-time WebSocket authentication token.

**Rate Limit:** 20 requests per minute

**Response:**

```json
{ "success": true, "token": "<uuid>" }
```

Token expires in 60 seconds and is single-use.

---

## WebSocket Protocol

Real-time test progress is delivered via WebSocket.

### Connection

```
ws://localhost:3001?token=<token>
```

1. Fetch a token: `GET /api/ws-token`
2. Connect with the token as a query parameter
3. Localhost connections without a token are accepted in development

### Subscribe to Test

After connecting, send a subscription message:

```json
{ "type": "subscribe", "testId": "test_<uuid>" }
```

### Message Types

**Connected** (sent immediately on connection):
```json
{ "type": "connected", "data": { "message": "WebSocket connected" } }
```

**Progress** (during test execution):
```json
{
  "type": "progress",
  "testId": "test_abc",
  "data": { "phase": "warmup", "current": 5, "total": 20, "duration": 1.23 }
}
```

**Complete** (test finished successfully):
```json
{
  "type": "complete",
  "testId": "test_abc",
  "data": { "testId": "test_abc", "testName": "My Test", "result": { ... } }
}
```

**Error** (test failed):
```json
{
  "type": "error",
  "testId": "test_abc",
  "data": { "message": "Error description" }
}
```

### Terminal Event Cache

`complete` and `error` events are cached for 60 seconds. If a client subscribes after the event has fired, the cached event is replayed immediately.

---

## Environment Variables

| Variable               | Default         | Description                              |
|------------------------|-----------------|------------------------------------------|
| `WEB_PORT`             | 3001            | API server port                          |
| `BIND_HOST`            | 127.0.0.1       | Bind address                             |
| `ENCRYPTION_KEY`       | (required)      | AES-256-GCM key for password encryption  |
| `CORS_ORIGIN`          | localhost:5173   | Comma-separated allowed origins          |
| `RATE_LIMIT_TEST_MAX`  | 10              | Max test execution requests per minute   |
| `MAX_CONCURRENT_TESTS` | 3               | Max concurrent test executions           |
