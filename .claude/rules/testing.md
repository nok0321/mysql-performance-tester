# Testing Strategy

## Test Modes

### Demo Mode (no real DB required)
```bash
npm run test:demo    # node cli/index.js demo
```
Use this to verify CLI logic without a MySQL connection.

### Sequential Test (real DB required)
```bash
npm start            # node cli/index.js run
```
Executes `.sql` files in `sql/` directory one by one.

### Parallel Test (real DB required)
```bash
npm run test:parallel   # node cli/index.js parallel
```
Executes `.sql` files in `parallel/` directory concurrently.

### Web UI (manual)
```bash
cd web && node server.js          # API server
cd web-ui && npm run dev          # Frontend
# Open http://localhost:5173
```

## Adding SQL Test Cases
- Sequential tests: add `.sql` file to `sql/` with prefix `NN_` for ordering
- Parallel tests: add `.sql` file to `parallel/` with prefix `NN_`
- Each file should contain a single query (or a small, self-contained set)

## Lint (web-ui)
```bash
cd web-ui && npm run lint    # ESLint check
```
Always run lint before committing web-ui changes.

## What to Check After Changes
| Change area      | Verification                                |
|------------------|---------------------------------------------|
| `lib/statistics` | `npm run test:demo` (uses mock data)        |
| `lib/core`       | `npm start` with a real DB connection       |
| `cli/commands`   | `npm run help`, then the specific command   |
| `web/routes`     | Start API server + curl or Web UI           |
| `web-ui/`        | `npm run lint` + manual test in browser     |
| `lib/reports`    | Check `performance_results/` output files   |

## No Automated Test Suite
This project currently has no automated unit/integration test framework (Jest, Mocha, etc.).
- Before adding one, discuss with the user
- Do NOT mock the MySQL connection in tests — use `demo` mode for DB-free checks
