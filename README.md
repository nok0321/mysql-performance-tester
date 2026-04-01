# MySQL Performance Tester

Node.js 22 + TypeScript + MySQL 5.7/8.0 向け クエリパフォーマンス測定ツール

パーセンタイル統計・ウォームアップ・EXPLAIN ANALYZE・並列負荷テスト・A/B比較を備えた、
**CLI** と **Web UI** の両方から使えるMySQLベンチマークツールです。

---

## 主な機能

| カテゴリ | 内容 |
|---|---|
| **統計** | P50〜P99.9 パーセンタイル・外れ値除外（IQR/Z-score/MAD）・変動係数 |
| **ウォームアップ** | キャッシュウォーミング自動実行・ウォームアップ効果分析 |
| **クエリ分析** | EXPLAIN ANALYZE・Performance Schema・Optimizer Trace・Buffer Pool 監視 |
| **並列テスト** | Random/RoundRobin/Sequential/CategoryBased の4戦略・QPS/TPS 計測 |
| **A/B 比較** | 2つのクエリの性能を並べて比較・パーセンタイル差分・ヒストグラム重ね合わせ |
| **クエリ履歴** | 同一クエリの実行履歴タイムライン・インデックス効果の可視化 |
| **レポート** | JSON/Markdown/HTML（グラフィカル）/CSV/Excel |
| **Web UI** | ブラウザから接続管理・テスト実行・結果確認・リアルタイム進捗（WebSocket） |
| **ストレージ** | SQLite（better-sqlite3）による永続化・JSON からの自動マイグレーション |
| **セキュリティ** | WebSocket ワンタイムトークン認証・AES-256-GCM パスワード暗号化 |
| **API** | cursor-based ページネーション |
| **i18n** | 日本語/英語切替（react-i18next・ブラウザ言語自動検出） |
| **アクセシビリティ** | ARIA ラベル・キーボードナビゲーション・skip-to-content |

---

## クイックスタート

```bash
# 1. クローン & インストール
git clone https://github.com/nok0321/mysql-performance-tester.git
cd mysql-performance-tester
npm install

# 2. 環境変数を設定
cp .env.example .env
# .env を編集して DB 接続情報と ENCRYPTION_KEY を入力

# 3a. CLI で実行
npm start                  # ./sql/ 内の .sql ファイルを順次テスト
npm run test:parallel      # ./parallel/ 内の .sql ファイルを並列テスト

# 3b. Web UI で実行（2つのターミナルが必要）
cd web && npm start        # ターミナル1: API サーバー（port 3001）
cd web-ui && npm run dev   # ターミナル2: フロントエンド（port 5173）
# ブラウザで http://localhost:5173 を開く
```

詳細なセットアップ手順（DBの作成・シードデータ投入含む）→ [docs/setup.md](docs/setup.md)

---

## Web UI

ブラウザで `http://localhost:5173` を開くと使用できます。

| 画面 | 概要 |
|---|---|
| 接続管理 | MySQL 接続先の登録・疎通確認・暗号化パスワード保存 |
| SQL ライブラリ | テスト用 SQL の登録・管理・カテゴリ分類 |
| 単一テスト | SQL を入力してウォームアップ付き計測・リアルタイム結果表示 |
| 並列テスト | 複数 SQL を並列実行・戦略別 QPS/P95 比較 |
| A/B 比較 | 2つのクエリを順次/並列で比較・差分サマリー |
| クエリ履歴 | 同一クエリの実行タイムライン・イベント注釈（インデックス追加等） |
| レポート | 過去結果の一覧・フォーマット別エクスポート |
| アナリティクス | 結果の傾向分析 |
| 設定 | アプリケーション設定 |

→ [docs/web-ui.md](docs/web-ui.md)（スクリーンショット付き）

---

## テック・スタック

| レイヤー | 技術 |
|---|---|
| **言語** | TypeScript (strict mode) |
| **ランタイム** | Node.js 22+ (ESM) / tsx |
| **フロントエンド** | React 19 + Vite + React Router 7 + Recharts |
| **バックエンド** | Express + WebSocket (ws) + better-sqlite3 |
| **データベース** | MySQL 5.7 / 8.0 (mysql2) |
| **i18n** | react-i18next |
| **セキュリティ** | Helmet / CORS / Rate Limiting / AES-256-GCM パスワード暗号化 |
| **テスト** | Vitest (unit + integration) / Docker Compose (MySQL 8.0) |
| **CI** | GitHub Actions |

---

## プロジェクト構成

```
mysql-performance-tester/
├── lib/                     # コアライブラリ（TypeScript）
│   ├── types/               # 型定義
│   ├── config/              # データベース・テスト設定
│   ├── core/                # DB接続・クエリ実行
│   ├── testers/             # 単一・並列テスター
│   ├── analyzers/           # EXPLAIN / Performance Schema 等
│   ├── statistics/          # パーセンタイル・外れ値検出
│   ├── warmup/              # ウォームアップ管理
│   ├── parallel/            # 並列実行エンジン・分散戦略
│   ├── reports/             # レポート生成・エクスポーター
│   ├── models/              # データモデル
│   ├── storage/             # 結果ファイル管理
│   └── utils/               # ロガー・フォーマッター・フィンガープリント
├── cli/                     # CLI インターフェース
│   ├── index.ts             # エントリポイント
│   ├── options.ts           # 引数パース
│   └── commands/            # run / parallel / analyze
├── web/                     # Express API サーバー（port 3001）
│   ├── server.ts            # サーバー本体 + WebSocket
│   ├── routes/              # connections / tests / reports / sql-library / history
│   ├── store/               # SQLite ベースの永続化ストア（database.ts で初期化）
│   ├── security/            # AES-256-GCM 暗号化・IDバリデーション
│   └── middleware/          # エラーハンドラ・環境変数バリデーション
├── web-ui/                  # React + Vite フロントエンド（port 5173）
│   └── src/
│       ├── pages/           # 9画面（接続/SQL/単一/並列/比較/履歴/レポート/分析/設定）
│       ├── components/      # 共有コンポーネント（チャート・テーブル・フォーム）
│       ├── api/             # API クライアント
│       ├── hooks/           # useWebSocket / useTestExecution
│       ├── i18n/            # 国際化設定（日本語/英語）
│       └── types/           # フロントエンド型定義
├── tests/                   # テストスイート
│   ├── statistics/          # 統計モジュールのユニットテスト
│   ├── utils/               # ユーティリティのユニットテスト
│   └── integration/         # 統合テスト（MySQL 必須）
├── sql/                     # 順次テスト用 SQL ファイル置き場
├── parallel/                # 並列テスト用 SQL ファイル置き場
├── setup/                   # DB スキーマ（01_ddl.sql）& シードデータ（02_seed.js）
├── performance_results/     # テスト結果出力先（gitignore）
└── docs/                    # 詳細ドキュメント
```

---

## 開発者向け

### テスト実行

```bash
# ユニットテスト
npm run test:unit

# 統合テスト（Docker MySQL が必要）
npm run docker:test:up       # テスト用 MySQL 起動
npm run test:integration     # 統合テスト実行
npm run docker:test:down     # MySQL 停止

# 型チェック
npm run typecheck

# フロントエンド Lint & ビルド
cd web-ui && npm run lint && npm run build
```

### CI

GitHub Actions で以下が自動実行されます:
- ユニットテスト + web-ui Lint + ビルド
- 統合テスト（MySQL 8.0 サービスコンテナ）

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/setup.md](docs/setup.md) | インストール・DB構築・環境変数 |
| [docs/cli.md](docs/cli.md) | CLI コマンドリファレンス |
| [docs/web-ui.md](docs/web-ui.md) | Web UI の使い方（スクリーンショット付き） |
| [docs/configuration.md](docs/configuration.md) | 全設定オプション |
| [docs/interpreting-results.md](docs/interpreting-results.md) | 結果の読み方・グレード評価・ベストプラクティス |
| [docs/DESIGN.md](docs/DESIGN.md) | アーキテクチャ設計ドキュメント |

---

## 動作要件

- **Node.js** 22 以上
- **MySQL** 5.7 以上（EXPLAIN ANALYZE は 8.0.18 以上が必要）
- npm
- **Docker**（統合テスト実行時のみ、任意）
