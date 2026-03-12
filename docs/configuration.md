# 設定リファレンス

## 環境変数（.env）

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL ホスト |
| `DB_PORT` | `3306` | MySQL ポート |
| `DB_USER` | — | MySQL ユーザー名 |
| `DB_PASSWORD` | — | MySQL パスワード |
| `DB_NAME` | — | データベース名 |
| `WEB_PORT` | `3001` | Web API サーバーのポート |

---

## CLI オプション

CLI 実行時に引数で上書きできます。環境変数より優先されます。

### 接続設定

| オプション | 説明 |
|---|---|
| `--host <host>` | MySQL ホスト |
| `--port <port>` | MySQL ポート |
| `--user <user>` | MySQL ユーザー名 |
| `--password <pass>` | MySQL パスワード |
| `--database <db>` | データベース名 |

### テスト設定

| オプション | デフォルト | 説明 |
|---|---|---|
| `--iterations <n>` | 20 | 各クエリの実行回数（最低10推奨） |
| `--threads <n>` | 10 | 並列スレッド数（並列テスト時） |
| `--sql-dir <path>` | `./sql` | 順次テスト用 SQL ディレクトリ |
| `--parallel-dir <path>` | `./parallel` | 並列テスト用 SQL ディレクトリ |
| `--output-dir <path>` | 自動生成 | 結果出力ディレクトリ |

### ウォームアップ設定

| オプション | デフォルト | 説明 |
|---|---|---|
| `--warmup` / `--no-warmup` | 有効 | ウォームアップの有無 |
| `--warmup-percentage <n>` | 20 | ウォームアップの割合（iterations の %） |

### 統計設定

| オプション | デフォルト | 説明 |
|---|---|---|
| `--remove-outliers` / `--no-remove-outliers` | 有効 | 外れ値除外の有無 |
| `--outlier-method <method>` | `iqr` | 外れ値検出手法: `iqr` / `zscore` / `mad` |

### 分析設定

| オプション | デフォルト | 説明 |
|---|---|---|
| `--explain-analyze` / `--no-explain-analyze` | 有効 | EXPLAIN ANALYZE（MySQL 8.0.18+ 必須） |
| `--performance-schema` / `--no-performance-schema` | 有効 | Performance Schema 統合 |
| `--optimizer-trace` / `--no-optimizer-trace` | 有効 | Optimizer Trace |
| `--buffer-pool-monitoring` | 有効 | Buffer Pool 監視 |

### その他

| オプション | 説明 |
|---|---|
| `--generate-report` / `--no-generate-report` | レポート生成の有無 |
| `--skip-parallel` | `run` コマンド時に並列テストをスキップ |
| `--verbose` | 詳細ログを表示 |
| `--version` | バージョンを表示 |

---

## 外れ値検出手法

| 手法 | 説明 | 適する用途 |
|---|---|---|
| `iqr` | IQR（四分位範囲）法 | 一般的なケース（推奨） |
| `zscore` | Z スコア法 | 正規分布に近いデータ |
| `mad` | MAD（中央絶対偏差）法 | 外れ値が多いデータ |

---

## テスト用 SQL ファイルの書き方

`sql/` または `parallel/` ディレクトリに `.sql` ファイルを配置します。
1ファイル1クエリで記述します。

```sql
-- sql/01_user_select.sql
SELECT u.id, u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active'
GROUP BY u.id, u.name
ORDER BY order_count DESC
LIMIT 100;
```

**ファイル名のルール:**

- ファイル名順（辞書順）に実行されます
- 番号プレフィックス（`01_`, `02_`）で順序を制御するのを推奨
- ファイル名がそのままテスト名になります（`01_user_select` → `01 User Select`）
- 日本語ファイル名はそのままテスト名に使用されます
