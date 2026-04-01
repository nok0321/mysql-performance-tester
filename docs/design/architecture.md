# アーキテクチャ設計

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
│  Store:     SQLite (better-sqlite3) + WAL mode       │
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

## 既知の制約と今後の方向性

### 現在の制約

| 制約 | 説明 | 影響 |
|------|------|------|
| **シングルプロセス** | Web サーバーは1プロセスで動作 | 水平スケーリング不可 |

### 改善ロードマップ

1. **Docker 一発起動** — Dockerfile + docker-compose.yml for full stack
2. **フロントエンドテストカバレッジ拡大** — web-ui コンポーネント・ページのテスト追加
3. **コード分割（web-ui バンドルサイズ削減）** — React.lazy + dynamic import による遅延読み込み
