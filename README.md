# MySQL Performance Tester

Node.js 22 + MySQL 5.7/8.0 向け クエリパフォーマンス測定ツール

パーセンタイル統計・ウォームアップ・EXPLAIN ANALYZE・並列負荷テストを備えた、
**CLI** と **Web UI** の両方から使えるMySQLベンチマークツールです。

---

## 主な機能

| カテゴリ | 内容 |
|---|---|
| **統計** | P50〜P99.9 パーセンタイル・外れ値除外（IQR/Z-score/MAD）・変動係数 |
| **ウォームアップ** | キャッシュウォーミング自動実行・ウォームアップ効果分析 |
| **クエリ分析** | EXPLAIN ANALYZE・Performance Schema・Optimizer Trace・Buffer Pool 監視 |
| **並列テスト** | Random/RoundRobin/Sequential/CategoryBased の4戦略・QPS/TPS 計測 |
| **レポート** | JSON/Markdown/HTML（グラフィカル）/CSV/Excel |
| **Web UI** | ブラウザから接続管理・テスト実行・結果確認・リアルタイム進捗 |

---

## クイックスタート

```bash
# 1. クローン & インストール
git clone https://github.com/nok0321/mysql-performance-tester.git
cd mysql-performance-tester
npm install

# 2. 環境変数を設定
cp .env.example .env
# .env を編集して DB 接続情報を入力

# 3a. CLI で実行
npm start                  # ./sql/ 内の .sql ファイルを順次テスト
npm run test:parallel      # ./parallel/ 内の .sql ファイルを並列テスト

# 3b. Web UI で実行（2つのターミナルが必要）
cd web && node server.js   # ターミナル1: API サーバー（port 3001）
cd web-ui && npm run dev   # ターミナル2: フロントエンド（port 5173）
```

詳細なセットアップ手順（DBの作成・シードデータ投入含む）→ [docs/setup.md](docs/setup.md)

---

## Web UI

ブラウザで `http://localhost:5173` を開くと使用できます。

| 画面 | 概要 |
|---|---|
| 接続管理 | MySQL 接続先の登録・疎通確認 |
| SQL ライブラリ | テスト用 SQL の登録・管理 |
| 単一テスト | SQL を入力してウォームアップ付き計測・リアルタイム結果表示 |
| 並列テスト | 複数 SQL を並列実行・戦略別 QPS/P95 比較 |
| レポート | 過去結果の一覧・フォーマット別エクスポート |
| アナリティクス | 結果の傾向分析 |

→ [docs/web-ui.md](docs/web-ui.md)（スクリーンショット付き）

---

## プロジェクト構成

```
mysql-performance-tester/
├── lib/                     # コアライブラリ
│   ├── config/              # データベース・テスト設定
│   ├── core/                # DB接続・クエリ実行
│   ├── testers/             # 単一・並列テスター
│   ├── analyzers/           # EXPLAIN / Performance Schema 等
│   ├── statistics/          # パーセンタイル・外れ値検出
│   ├── warmup/              # ウォームアップ管理
│   ├── reports/             # レポート生成・エクスポーター
│   ├── storage/             # 結果ファイル管理
│   └── utils/               # ロガー・フォーマッター等
├── cli/                     # CLI インターフェース
│   ├── index.js             # エントリポイント
│   ├── options.js           # 引数パース
│   └── commands/            # run / parallel / analyze / demo
├── web/                     # Express API サーバー（port 3001）
│   ├── server.js
│   └── routes/              # connections / tests / reports / sql-library
├── web-ui/                  # React + Vite フロントエンド（port 5173）
├── sql/                     # 順次テスト用 SQL ファイル置き場
├── parallel/                # 並列テスト用 SQL ファイル置き場
├── setup/                   # DB スキーマ・シードデータ
│   ├── 01_ddl.sql
│   └── 02_seed.js
├── performance_results/     # テスト結果出力先
└── docs/                    # 詳細ドキュメント
```

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/setup.md](docs/setup.md) | インストール・DB構築・環境変数 |
| [docs/cli.md](docs/cli.md) | CLI コマンドリファレンス |
| [docs/web-ui.md](docs/web-ui.md) | Web UI の使い方（スクリーンショット付き） |
| [docs/configuration.md](docs/configuration.md) | 全設定オプション |
| [docs/interpreting-results.md](docs/interpreting-results.md) | 結果の読み方・グレード評価・ベストプラクティス |

---

## 動作要件

- **Node.js** 22 以上
- **MySQL** 5.7 以上（EXPLAIN ANALYZE は 8.0.18 以上が必要）
- npm
