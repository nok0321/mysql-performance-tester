# MySQL Performance Tester
<!-- MySQL 5.7/8.0 向けクエリパフォーマンス測定ツール — Node.js 22 / ESM / CLI + Web UI -->

## Communication Policy
- Respond in **Japanese** when the user writes in Japanese.
- All source code, variable names, and code comments must be written in **English**.

## Tech Stack
- **Language / Runtime**: Node.js 22 (ES Modules — `"type": "module"`)
- **Frontend**: React 19 + Vite + React Router 7 + Recharts
- **Backend**: Express (web/server.ts — port 3001)
- **Database client**: mysql2 ^3.6.0
- **Target DB**: MySQL 5.7 / 8.0 (EXPLAIN ANALYZE は 8.0.18+ 必要)
- **Package manager**: npm

## Essential Commands

```bash
# CLI
npm start                        # ./sql/ 内の .sql を順次テスト (cli run)
npm run test:parallel            # ./parallel/ 内の .sql を並列テスト
npm run test:demo                # デモモード実行
npm run help                     # CLI ヘルプ表示

# Web (2ターミナル必要)
cd web && npx tsx server.ts      # API サーバー起動 (port 3001)
cd web-ui && npm run dev         # フロントエンド起動 (port 5173)

# Lint (web-ui のみ)
cd web-ui && npm run lint        # ESLint 実行
cd web-ui && npm run build       # プロダクションビルド
```

## Structure
```
mysql-performance-tester/
├── lib/                     # コアライブラリ (ESM)
│   ├── config/              # DB・テスト設定
│   ├── core/                # DB接続・クエリ実行 (database-connection.ts, query-executor.ts, test-runner.ts)
│   ├── testers/             # 単一・並列テスター
│   ├── analyzers/           # EXPLAIN / Performance Schema / Optimizer Trace
│   ├── statistics/          # パーセンタイル・外れ値検出 (IQR/Z-score/MAD)
│   ├── warmup/              # ウォームアップ管理
│   ├── reports/             # レポート生成 (JSON/Markdown/HTML/CSV/Excel)
│   ├── storage/             # 結果ファイル管理
│   └── utils/               # ロガー・フォーマッター
├── cli/                     # CLI インターフェース
│   ├── index.ts             # エントリポイント
│   ├── options.ts           # 引数パース
│   └── commands/            # run / parallel / analyze / demo
├── web/                     # Express API サーバー (port 3001)
│   ├── server.ts
│   ├── routes/              # connections / tests / reports / sql-library
│   └── store/               # SQLite ベースの永続化ストア (database.ts で初期化)
├── web-ui/                  # React + Vite フロントエンド (port 5173)
│   └── src/
│       ├── pages/           # Connections / SingleTest / ParallelTest / SqlLibrary / Reports / Analytics
│       ├── api/             # API クライアント
│       ├── hooks/           # カスタム React フック
│       └── i18n/            # 国際化設定 (日本語/英語)
├── sql/                     # 順次テスト用 SQL ファイル置き場
├── parallel/                # 並列テスト用 SQL ファイル置き場
├── setup/                   # DB スキーマ (01_ddl.sql) & シードデータ (02_seed.js)
├── performance_results/     # テスト結果出力先 (gitignore 推奨)
└── docs/                    # ドキュメント
```

## Slash Commands
<!-- /command-name でプロジェクト固有のワークフローを呼び出せます -->
- `/run-test`      — `sql/` の SQL を順次テスト実行
- `/run-parallel`  — `parallel/` の SQL を並列負荷テスト実行
- `/add-sql`       — SQL テストファイルを追加
- `/check-results` — 最新のテスト結果をサマリー表示
- `/start-web`     — Web UI 起動手順を案内

## Detailed Rules
<!-- 詳細なルールは .claude/rules/ に分離 -->
- コードスタイル・命名規則: `.claude/rules/code-style.md`
- アーキテクチャパターン: `.claude/rules/architecture.md`
- テスト戦略:             `.claude/rules/testing.md`

## Non-Negotiable Constraints
- Never commit `.env` or any `.env.*` file (DB credentials が含まれる)
- Never force-push to `main` / `develop`
- Never log or expose DB passwords / connection strings in output
- `performance_results/` の内容はコミット不要 (gitignore 推奨)
- ESM プロジェクトのため `require()` は使用不可 — 常に `import` / `export` を使うこと

## Landmines & Gotchas
- ESM (`"type": "module"`) のため、`__dirname` / `__filename` は使えない → `import.meta.url` + `fileURLToPath` を使うこと
- `EXPLAIN ANALYZE` は MySQL 8.0.18 未満では動作しない → バージョンチェックが必要
- `web/` と `web-ui/` は別々の `node_modules` を持つ — ルートの npm install では web-ui の依存は入らない
- MySQL 接続は使用後に必ず `connection.end()` または `pool.end()` すること (コネクションリーク防止)
- 並列テストの SQL ファイルは `parallel/` に置く — `sql/` は順次テスト専用
- `performance_results/` はテスト結果の蓄積先 — 既存ファイルを削除しないこと

## Key Documentation
- セットアップ手順:       `docs/setup.md`
- CLI リファレンス:       `docs/cli.md`
- Web UI の使い方:       `docs/web-ui.md`
- 全設定オプション:       `docs/configuration.md`
- 結果の読み方・評価:    `docs/interpreting-results.md`
