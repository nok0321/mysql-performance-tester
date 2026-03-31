# Architecture Design Document

MySQL Performance Tester のアーキテクチャ設計ドキュメント。

---

## 設計思想

### 原則

1. **レイヤー分離**: `lib/`（コアロジック）は CLI・Web から独立した純粋ライブラリ
2. **テスト実行の非同期性**: HTTP 202 即時応答 + WebSocket で進捗を配信
3. **拡張可能な戦略**: Strategy パターンで並列テストの分散方式を切り替え可能
4. **セキュリティ・バイ・デフォルト**: パスワード暗号化、Rate Limiting、入力検証

### 技術選定の理由

| 選定 | 理由 |
|------|------|
| **TypeScript + tsx** | 型安全性を確保しつつビルドステップを排除（tsx が直接実行） |
| **ESM** | Node.js 22+ のネイティブモジュールシステム。Top-level await が使える |
| **Express + ws** | REST API + WebSocket を同一ポートで提供。軽量で既知のエコシステム |
| **React 19 + Vite** | 高速な HMR 開発体験。React Router 7 で SPA ルーティング |
| **Recharts** | React ネイティブのチャートライブラリ。ヒストグラム・タイムライン描画に使用 |
| **mysql2** | Promise API + コネクションプール。MySQL 5.7/8.0 両対応 |
| **Vitest** | ESM ネイティブ対応のテストフレームワーク。Vite と同じ設定を共有 |

---

## システムアーキテクチャ

### レイヤー構成

```
┌─────────────────────────────────────────────────────┐
│  Frontend (web-ui/)                                 │
│  React 19 + Vite + Recharts                         │
│  Port 5173                                          │
│                                                     │
│  Pages:  Connections | SQL Library | Single Test     │
│          Parallel Test | Comparison | Query History  │
│          Reports | Analytics | Settings              │
│                                                     │
│  Hooks:  useWebSocket | useTestExecution             │
└─────────────┬──────────────────────┬────────────────┘
              │ REST (HTTP)          │ WebSocket
              ▼                      ▼
┌─────────────────────────────────────────────────────┐
│  Backend (web/)                                     │
│  Express + ws                                       │
│  Port 3001                                          │
│                                                     │
│  Routes:  /api/connections | /api/tests             │
│           /api/sql | /api/reports | /api/history     │
│                                                     │
│  Middleware: Helmet | CORS | Rate Limit | Error      │
│  Security:  AES-256-GCM | ID Validation             │
│  Store:     JSON File (connections, sql, events)     │
└─────────────┬───────────────────────────────────────┘
              │ Function calls
              ▼
┌─────────────────────────────────────────────────────┐
│  Core Library (lib/)                                │
│                                                     │
│  config/       DB・テスト設定ビルダー                  │
│  core/         DatabaseConnection, QueryExecutor     │
│  testers/      SingleTester, ParallelTester          │
│  analyzers/    EXPLAIN, OptimizerTrace, PerfSchema   │
│  statistics/   Percentiles, Outliers, Distribution   │
│  parallel/     Executor, DistributionStrategy        │
│  warmup/       WarmupManager, CacheEffectiveness     │
│  reports/      Generator + 5 Exporters               │
│  storage/      FileManager, ResultStorage            │
│  utils/        Logger, Formatter, Fingerprint        │
└─────────────┬───────────────────────────────────────┘
              │ mysql2 (Connection Pool)
              ▼
┌─────────────────────────────────────────────────────┐
│  MySQL 5.7 / 8.0                                    │
│  EXPLAIN ANALYZE (8.0.18+)                          │
│  Performance Schema                                 │
│  Optimizer Trace                                    │
│  InnoDB Buffer Pool                                 │
└─────────────────────────────────────────────────────┘
```

### CLI パス

```
CLI (cli/)
├── index.ts        # エントリポイント（tsx shebang）
├── options.ts      # 引数パース
└── commands/
    ├── run.ts      # → lib/testers/single-tester
    ├── parallel.ts # → lib/testers/parallel-tester
    └── analyze.ts  # → lib/reports/report-generator

CLI → lib/ → MySQL（直接実行、Web レイヤーを経由しない）
```

---

## データフロー

### テスト実行フロー（Web UI 経由）

```
User clicks "Run Test"
│
▼ POST /api/tests/single
├── 1. Validate connectionId, SQL query
├── 2. Decrypt password from connections-store
├── 3. Build DbConfig + TestConfig
├── 4. Acquire semaphore (MAX_CONCURRENT_TESTS)
│      └── 429 if exhausted
├── 5. Return HTTP 202 { testId }
│
└── 6. setImmediate() (async execution)
       │
       ├── new MySQLPerformanceTester(dbConfig, testConfig)
       ├── tester.initialize()   → Connection pool created
       ├── tester.on('progress') → broadcast via WebSocket
       │
       ├── tester.executeTestWithWarmup(name, sql)
       │   ├── Warmup phase (if enabled)
       │   │   └── Execute N iterations, discard results
       │   ├── Measuring phase
       │   │   └── Execute N iterations, collect durations
       │   ├── Outlier removal (IQR/Z-score/MAD)
       │   ├── Statistics calculation (P50-P99.9)
       │   └── Analysis (EXPLAIN, Performance Schema, etc.)
       │
       ├── Save result → performance_results/{testId}.json
       ├── broadcast({ type: 'complete', testId, data: result })
       └── finally: tester.cleanup() + releaseSemaphore()
```

### WebSocket プロトコル

```
Client → Server:
  { type: "subscribe", testId: "abc123" }

Server → Client:
  { type: "progress", testId: "abc123", data: { phase, current, total, duration } }
  { type: "complete", testId: "abc123", data: { ...TestResult } }
  { type: "error",    testId: "abc123", data: { message: "..." } }
```

- Terminal events (`complete`/`error`) are cached for 60 seconds
- Late subscribers receive cached terminal events immediately
- Clients subscribe per testId (multi-test support)

### フロントエンド状態管理

```
useWebSocket(onMessage)
  │ Exponential backoff reconnection (3s → 30s cap)
  │ Pending subscribe queue (before connection open)
  ▼
useTestExecution()
  │ useReducer pattern
  │ Actions: start → progress → complete/error
  │ liveData capped at 60 points
  ▼
Page components (SingleTest, ParallelTest, ComparisonTest)
```

---

## 設計パターン

### Strategy パターン（並列テスト分散）

```
DistributionStrategy (abstract)
├── RandomDistributionStrategy
├── RoundRobinDistributionStrategy
├── SequentialDistributionStrategy
└── CategoryBasedDistributionStrategy

StrategyFactory.createStrategy(name, sqlFileManager)
```

新しい戦略を追加するには:
1. `DistributionStrategy` を継承したクラスを作成
2. `selectSQLFile(threadId, iteration, testIterations)` を実装
3. `StrategyFactory.strategies` Map に登録

### EventEmitter パターン（進捗通知）

```typescript
// lib/testers/single-tester.ts
class MySQLPerformanceTester extends EventEmitter {
  // 実行中に emit
  this.emit('progress', {
    phase: 'warmup' | 'measuring',
    current: number,
    total: number,
    duration: number | null
  });
}

// web/routes/tests.ts
tester.on('progress', (data) => {
  broadcast(wss, testId, 'progress', data);
});
```

### セマフォ（同時実行制御）

```typescript
// web/routes/tests.ts
let runningTests = 0;
const MAX_CONCURRENT_TESTS = Number(process.env.MAX_CONCURRENT_TESTS) || 3;

function acquireSemaphore(): boolean {
  if (runningTests >= MAX_CONCURRENT_TESTS) return false;
  runningTests++;
  return true;
}
```

### Dependency Injection（テスタビリティ）

```typescript
// lib/testers/single-tester.ts
constructor(dbConfig, testConfig, deps = {}) {
  this.db = deps.db ?? null;  // Deferred creation
  this.warmupManager = deps.warmupManager ?? new WarmupManager(...);
  // Analyzers created in initialize() when this.db is available
}
```

---

## セキュリティ設計

### パスワード暗号化

```
Algorithm:  AES-256-GCM (AEAD)
Key:        scrypt(ENCRYPTION_KEY, random_salt, 32 bytes)
Format:     enc:<salt_b64>:<iv_b64>:<authTag_b64>:<ciphertext_b64>

Properties:
- Random salt per encryption (prevents rainbow tables)
- Random IV per encryption (128-bit GCM nonce)
- Auth tag verification (detects tampering)
- Backward compatibility: auto-detects plain text & v1 format
```

### API セキュリティ

| 対策 | 実装 |
|------|------|
| **Security Headers** | Helmet.js（CSP, X-Frame-Options, etc.） |
| **CORS** | `http://localhost:5173` のみ許可 |
| **Rate Limiting** | テストエンドポイント: 10 req/min（設定可能） |
| **Input Validation** | ID: `^[a-zA-Z0-9_\-]+$` / SQL: `validateQuery()` |
| **Path Traversal** | `validateParallelDir()` が絶対パス・プロジェクト外パスを拒否 |
| **Password Masking** | API レスポンスでは `••••••••` に置換 |

### データストア

- `web/data/connections.json` — パスワード暗号化済み、gitignore 対象
- `web/data/sql-store.json` — SQL スニペット保存
- `web/data/query-events.json` — タイムラインイベント
- Atomic write (temp file + rename) でファイル破損を防止
- Promise-based mutex で同一プロセス内の書き込み競合を防止

---

## データモデル

### コア型（lib/types/index.ts）

```typescript
// テスト設定
DbConfig { host, port, user, password, database, connectionLimit, ... }
TestConfig { testIterations, parallelThreads, enableWarmup, outlierMethod, ... }

// テスト結果
TestResult { query, durations[], statistics, warmup?, explain?, recommendations? }
StatisticsResult { basic, spread, percentiles, distribution, outlierInfo? }
ParallelMetrics { totalQueries, successCount, qps, duration, latencyPercentiles }

// クエリ分析
ExplainResult { queryPlan, warnings[] }
ExplainAnalyzeResult { data, format, executionPlan }
BufferPoolMetrics { hitRatio, readRequests, reads, pages }
PerformanceSchemaMetrics { bufferPool, recentQueries, topWaits, ... }

// クエリ履歴
QueryTimeline { fingerprint, sql, entries[], events[] }
QueryEvent { id, fingerprint, type, description, timestamp }
```

### フロントエンド型（web-ui/src/types/index.ts）

- バックエンド型のミラーリング + UI 固有の型
- `Connection` / `ConnectionFormData` の分離（表示用 vs フォーム用）
- `RunState` / `RunAction` — Reducer パターン用

---

## 統計エンジン

### パーセンタイル計算

```
P01, P05, P10, P25 (Q1), P50 (Median), P75 (Q3),
P90, P95, P99, P99.5, P99.9

Method: Linear interpolation between sorted values
```

### 外れ値検出（3手法）

| 手法 | アルゴリズム | 適する用途 |
|------|-------------|-----------|
| **IQR** | Q1 - 1.5×IQR ～ Q3 + 1.5×IQR | 一般的なケース（推奨） |
| **Z-score** | \|z\| > 3.0 | 正規分布に近いデータ |
| **MAD** | Modified Z-score > 3.5 | 外れ値が多いデータ |

### ウォームアップ

```
Total iterations = Warmup iterations + Measuring iterations
Warmup % = configurable (default 20%)

Warmup phase:  Execute queries to populate Buffer Pool / query cache
Measuring:     Collect durations for statistical analysis
```

---

## テスト戦略

### テスト構成

```
tests/
├── statistics/          # ユニットテスト（純粋関数）
│   ├── statistics-calculator.test.ts
│   ├── outlier-detector.test.ts
│   └── distribution-analyzer.test.ts
├── utils/               # ユニットテスト（ユーティリティ）
│   ├── formatter.test.ts
│   ├── validator.test.ts
│   └── query-fingerprint.test.ts
└── integration/         # 統合テスト（MySQL 必須）
    ├── core/            # DB接続・クエリ実行
    ├── analyzers/       # EXPLAIN / Performance Schema
    ├── testers/         # 単一・並列テスター
    └── helpers/         # テストDB初期化・共通クエリ
```

### Vitest 設定

- **unit**: `tests/**/*.test.ts`（integration 除外）— 並列実行
- **integration**: `tests/integration/**/*.integration.test.ts` — 直列実行、30s タイムアウト
- Docker Compose で MySQL 8.0 テストコンテナを提供（port 3307）

### CI パイプライン

```
GitHub Actions
├── Job 1: test-and-lint
│   ├── npm run test:unit
│   ├── cd web-ui && npm run lint
│   └── cd web-ui && npm run build
└── Job 2: integration-test
    ├── Service: MySQL 8.0 (port 3307)
    ├── Schema initialization
    └── npm run test:integration
```

---

## 既知の制約と今後の方向性

### 現在の制約

| 制約 | 説明 | 影響 |
|------|------|------|
| **JSON ファイルストレージ** | connections/sql/events がJSONファイル | 同時書き込みはプロセス内 mutex のみ |
| **シングルプロセス** | Web サーバーは1プロセスで動作 | 水平スケーリング不可 |
| **WebSocket 認証なし** | localhost IP チェックのみ | 外部公開には不十分 |
| **ページネーション未実装** | 履歴・レポート API が全件返却 | データ蓄積時に性能劣化 |

### 改善ロードマップ

1. **テストカバレッジ拡大** — reports, storage, warmup, CLI のテスト追加
2. **ストレージ移行** — JSON → SQLite（ACID、ページネーション、同時アクセス）
3. **API ページネーション** — cursor-based pagination for history/reports
4. **WebSocket 認証** — JWT or one-time token
5. **型共有パッケージ** — `packages/types/` でバックエンド・フロントエンドの型を一元管理
6. **Docker 一発起動** — Dockerfile + docker-compose.yml for full stack
