# テスト戦略

## テスト構成

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
├── store/               # SQLite ストアテスト
│   ├── database.test.ts          # DB 初期化・スキーマ・マイグレーション
│   ├── connections-store.test.ts  # 接続情報 CRUD
│   ├── sql-store.test.ts          # SQL スニペット CRUD
│   └── events-store.test.ts       # クエリイベント CRUD
├── web-ui/              # フロントエンドテスト（Vitest + Testing Library）
│   ├── components/      # 共通コンポーネントテスト
│   └── pages/           # ページコンポーネントテスト
└── integration/         # 統合テスト（MySQL 必須）
    ├── core/            # DB接続・クエリ実行
    ├── analyzers/       # EXPLAIN / Performance Schema
    ├── testers/         # 単一・並列テスター
    └── helpers/         # テストDB初期化・共通クエリ
```

### tests/store/ — SQLite ストアテスト

SQLite ストア層のユニットテスト。`:memory:` データベースを使用するため高速に実行可能。

- **database.test.ts**: スキーマ作成、バージョン管理、JSON → SQLite 自動マイグレーション
- **connections-store.test.ts**: 接続情報の作成・取得・更新・削除、パスワード暗号化
- **sql-store.test.ts**: SQL スニペットの CRUD、カテゴリフィルタ、タグ検索
- **events-store.test.ts**: クエリイベントの記録・取得、fingerprint によるフィルタリング

### tests/web-ui/ — フロントエンドテスト

Vitest + React Testing Library によるフロントエンドテスト。

- **コンポーネントテスト**: 共通 UI コンポーネントの描画・インタラクション検証
- **ページテスト**: 各ページの初期描画、API 呼び出し、ユーザー操作フロー
- **設定**: `web-ui/vitest.config.ts` で jsdom 環境を使用

---

## Vitest 設定

- **unit**: `tests/**/*.test.ts`（integration 除外）— 並列実行
- **integration**: `tests/integration/**/*.integration.test.ts` — 直列実行、30s タイムアウト
- Docker Compose で MySQL 8.0 テストコンテナを提供（port 3307）

---

## CI パイプライン

```
GitHub Actions
├── Job 1: test-and-lint
│   ├── npm install
│   ├── cd web && npm install          # better-sqlite3 ビルド
│   ├── npm run test:unit
│   ├── cd web-ui && npm install
│   ├── cd web-ui && npm run lint
│   └── cd web-ui && npm run build
└── Job 2: integration-test
    ├── Service: MySQL 8.0 (port 3307)
    ├── Schema initialization
    └── npm run test:integration
```

---

## テスト規模

- **410+ ユニットテスト**: statistics, utils, store, web-ui
- **統合テスト**: Docker MySQL 8.0 を使用した core, analyzers, testers のテスト
- **Lint**: ESLint（web-ui）+ eslint-plugin-jsx-a11y（アクセシビリティ）
