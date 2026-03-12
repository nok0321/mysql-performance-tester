# CLI リファレンス

## 基本的な使い方

```bash
node cli/index.js <command> [options]
# または npm scripts 経由
npm run <script>
```

---

## コマンド一覧

### `run` — 順次テスト（デフォルト）

`./sql/` ディレクトリの `.sql` ファイルをファイル名順に1件ずつ実行します。

```bash
node cli/index.js run
npm start
```

**SQL ファイルの配置例:**
```
sql/
├── 01_simple_select.sql
├── 02_join_aggregation.sql
├── 03_category_aggregation.sql
└── 04_subquery_test.sql
```

主なオプション:

| オプション | デフォルト | 説明 |
|---|---|---|
| `--iterations <n>` | 20 | 各クエリの実行回数 |
| `--warmup` / `--no-warmup` | 有効 | ウォームアップの有無 |
| `--sql-dir <path>` | `./sql` | SQL ファイルのディレクトリ |
| `--output-dir <path>` | 自動生成 | 結果出力先 |
| `--skip-parallel` | false | 並列テストをスキップ |
| `--verbose` | false | 詳細ログを表示 |

---

### `parallel` — 並列負荷テスト

`./parallel/` ディレクトリの `.sql` ファイルを複数スレッドで同時実行し、
QPS・TPS・P95 などを計測します。

```bash
node cli/index.js parallel
npm run test:parallel
```

**SQL ファイルの配置例:**
```
parallel/
├── 01_read_basic.sql
├── 02_read_join.sql
└── 03_write_insert.sql
```

主なオプション:

| オプション | デフォルト | 説明 |
|---|---|---|
| `--threads <n>` | 10 | 並列スレッド数 |
| `--iterations <n>` | 20 | スレッドごとの実行回数 |
| `--parallel-dir <path>` | `./parallel` | 並列 SQL のディレクトリ |

---

### `analyze` — 既存結果の再分析

保存済みのテスト結果 JSON からレポートを再生成します。

```bash
node cli/index.js analyze <result-path>
```

**例:**
```bash
# ディレクトリを指定（results.json を自動検出）
node cli/index.js analyze ./performance_results/2025-01-15T10-30-00

# ファイルを直接指定
node cli/index.js analyze ./performance_results/2025-01-15T10-30-00/results.json
```

---

### `demo` — 動作確認

DB 接続の疎通確認と簡単なクエリ実行で動作を確認します。

```bash
node cli/index.js demo
npm run test:demo
```

---

### `help` — ヘルプ表示

```bash
node cli/index.js help
npm run help
```

---

## 出力ファイル

テスト実行後、`./performance_results/<タイムスタンプ>/` に以下が生成されます。

```
performance_results/
└── 2025-01-15T10-30-00/
    ├── results.json          # 生データ
    ├── analysis-report.json  # 分析レポート（JSON）
    ├── analysis-report.md    # 分析レポート（Markdown）
    ├── analysis-report.html  # ビジュアルレポート（グラフ付き）
    └── csv-reports/
        ├── summary.csv
        └── details.csv
```

---

## npm scripts 一覧

| スクリプト | コマンド | 説明 |
|---|---|---|
| `npm start` | `node cli/index.js run` | 順次テスト実行 |
| `npm run test:demo` | `node cli/index.js demo` | デモ実行 |
| `npm run test:parallel` | `node cli/index.js parallel` | 並列テスト実行 |
| `npm run help` | `node cli/index.js help` | ヘルプ表示 |
