# Architecture Patterns

## Layered Architecture

```
CLI (cli/)  ←→  Core Library (lib/)  ←→  MySQL
Web API (web/)  ←→  Core Library (lib/)  ←→  MySQL
Web UI (web-ui/)  ←→  Web API (web/)
```

### lib/ — Core Library (shared by CLI and Web API)
- **config/**: DB connection config, test config defaults
- **core/**: Low-level DB interaction (`database-connection.js`, `query-executor.js`, `test-runner.js`)
- **testers/**: High-level test orchestration (single test, parallel test)
- **analyzers/**: Query analysis (`EXPLAIN ANALYZE`, Performance Schema, Optimizer Trace, Buffer Pool)
- **statistics/**: Pure statistical functions (percentiles P50–P99.9, outlier detection IQR/Z-score/MAD, CV)
- **warmup/**: Cache warming logic and warmup effect analysis
- **reports/**: Report generation and export (JSON / Markdown / HTML / CSV / Excel)
- **storage/**: Result file I/O (`performance_results/`)
- **utils/**: Logger, formatters (shared utilities)
- **models/**: Data model definitions / TypeScript-like JSDoc types

### cli/ — CLI Interface
- Thin wrapper over `lib/`; parsing only in `options.js`
- Commands in `cli/commands/` delegate immediately to lib testers

### web/ — Express API Server (port 3001)
- REST API consumed by web-ui
- Routes in `web/routes/`: `connections.js`, `tests.js`, `reports.js`, `sql-library.js`
- `web/store/`: Server-side in-memory state (connection registry, etc.)
- `web/security/`: Security middleware
- No business logic in routes — delegate to `lib/`

### web-ui/ — React + Vite Frontend (port 5173)
- Pages in `src/pages/` (one file per major feature)
- API client modules in `src/api/` (mirror `web/routes/`)
- Shared state via React hooks in `src/hooks/`
- Charts with Recharts

## Key Design Principles
- `lib/` has **no knowledge** of CLI or Web — it is a pure library
- Web API is stateless per request where possible; use `web/store/` for persistent server-side state (e.g., saved connections)
- SQL files are **data**, not code — stored in `sql/` (sequential) or `parallel/` (parallel)
- Test results are persisted to `performance_results/` as JSON for later retrieval

## Adding a New Feature
1. Implement core logic in the appropriate `lib/` module
2. Expose via CLI command in `cli/commands/` if CLI-relevant
3. Add API route in `web/routes/` if Web-relevant
4. Add UI page/component in `web-ui/src/pages/` if user-facing
