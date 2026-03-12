# Code Style & Naming Conventions

## Module System
- This is an **ESM-only** project (`"type": "module"` in package.json)
- Always use `import` / `export` — never `require()` / `module.exports`
- Use `import.meta.url` + `fileURLToPath` instead of `__dirname` / `__filename`:
  ```js
  import { fileURLToPath } from 'url';
  import { dirname, join } from 'path';
  const __dirname = dirname(fileURLToPath(import.meta.url));
  ```

## Naming
- Files: `kebab-case.js` (e.g., `query-executor.js`, `test-runner.js`)
- Classes: `PascalCase` (e.g., `QueryExecutor`, `PerformanceTester`)
- Functions / variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for module-level config constants
- SQL files: `NN_descriptive-name.sql` (e.g., `01_simple_select.sql`)

## JavaScript Style
- Use `async/await` over raw Promises
- Prefer `const` over `let`; avoid `var`
- Always handle promise rejections (try/catch or `.catch()`)
- Use destructuring for function parameters where it improves readability
- Arrow functions for callbacks; named functions for exported/top-level logic

## MySQL / SQL
- SQL keywords in UPPERCASE (`SELECT`, `FROM`, `WHERE`, `JOIN`, etc.)
- Table/column names in snake_case
- Always parameterize queries — never interpolate user input into SQL strings
- Use connection pools for repeated queries; release connections after use

## Error Handling
- Always propagate errors with meaningful context messages
- Log errors with the project logger (`lib/utils/`) — not bare `console.error`
- Never swallow errors silently

## React (web-ui)
- Functional components only — no class components
- Custom hooks in `src/hooks/`
- API calls through `src/api/` modules — not inline `fetch` in components
- Use React Router 7 for navigation
