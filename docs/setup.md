# セットアップガイド

## 動作要件

- Node.js 22 以上
- MySQL 5.7 以上（EXPLAIN ANALYZE を使う場合は 8.0.18 以上を推奨）
- npm

---

## インストール

```bash
git clone https://github.com/nok0321/mysql-performance-tester.git
cd mysql-performance-tester

# コアライブラリ + CLI の依存関係
npm install

# Web API サーバーの依存関係
cd web && npm install && cd ..

# Web フロントエンドの依存関係
cd web-ui && npm install && cd ..
```

> TypeScript ソースは `tsx` で直接実行されるため、ビルドステップは不要です。

---

## 環境変数の設定

```bash
cp .env.example .env
```

`.env` を開いて接続情報を入力します。

```dotenv
# セキュリティ（必須: Web UI でパスワードを暗号化保存するために必要）
ENCRYPTION_KEY=your_random_secret_key_here   # 32文字以上

# MySQL 接続設定
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=perf_test
```

> Web サーバーのポートを変更したい場合は `WEB_PORT=3001` も追加できます。
> `ENCRYPTION_KEY` が未設定の場合、パスワードは平文で保存されます（警告が表示されます）。

---

## データベースのセットアップ

### 1. スキーマ作成

`setup/01_ddl.sql` を実行するとデータベース `perf_test` を作成し、
テスト用テーブル（users / products / orders / order_items）が作られます。

```bash
mysql -u root -p < setup/01_ddl.sql
```

**既存のデータベースを使う場合**は `01_ddl.sql` の先頭3行をコメントアウトし、
その下の `DROP TABLE IF EXISTS ...` 4行のコメントを外してから実行してください。

```sql
-- DROP DATABASE IF EXISTS perf_test;       ← コメントアウト
-- CREATE DATABASE perf_test ...;           ← コメントアウト
-- USE perf_test;                           ← コメントアウト

DROP TABLE IF EXISTS order_items;           ← コメント解除
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
```

### 2. シードデータ投入

```bash
node setup/02_seed.js
```

テスト用のダミーデータ（ユーザー・商品・注文）が挿入されます。

---

## 起動方法

### CLI のみ使う場合

```bash
npm start          # ./sql/ 内の SQL ファイルを順次実行
```

→ 詳細は [cli.md](cli.md) を参照

### Web UI を使う場合

2つのターミナルで別々に起動します。

**ターミナル1 — API サーバー（port 3001）**

```bash
cd web
npm start              # tsx server.ts
# または開発時（ファイル変更を自動検知）
npm run dev            # tsx watch server.ts
```

起動確認:
```
🚀 MySQL Performance Tester Web API
   REST API : http://localhost:3001/api
   WebSocket: ws://localhost:3001
   Health   : http://localhost:3001/api/health
```

**ターミナル2 — フロントエンド（port 5173）**

```bash
cd web-ui
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

> API サーバーが起動していない状態でフロントエンドを開くと
> `ECONNREFUSED` エラーがコンソールに出ます。必ず両方を起動してください。

---

## トラブルシューティング

### MySQL に接続できない

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

- MySQL が起動しているか確認
- `DB_HOST` / `DB_PORT` が正しいか確認
- ファイアウォール設定を確認

### 権限エラー

```
Error: Access denied for user 'root'@'localhost'
```

テストユーザーに最低限 `SELECT`, `PROCESS`, `SHOW VIEW` 権限が必要です。

```sql
GRANT SELECT, PROCESS, SHOW VIEW ON perf_test.* TO 'your_user'@'localhost';
```

### Performance Schema が無効

```
Warning: Performance Schema が無効です
```

`my.cnf`（または `my.ini`）に以下を追加して MySQL を再起動してください。

```ini
[mysqld]
performance_schema = ON
```

### EXPLAIN ANALYZE が使えない

```
Warning: EXPLAIN ANALYZE 未サポート
```

MySQL 8.0.18 未満のバージョンでは EXPLAIN ANALYZE は使えません。
`enableExplainAnalyze: false` に設定するか、MySQL をアップグレードしてください。

---

## テスト環境のセットアップ（開発者向け）

Docker Compose で統合テスト用の MySQL を起動できます。

```bash
# テスト用 MySQL 起動（port 3307）
npm run docker:test:up

# .env.test を作成（初回のみ）
cp .env.test.example .env.test

# ユニットテスト
npm run test:unit

# 統合テスト（MySQL 接続が必要）
npm run test:integration

# テスト用 MySQL 停止
npm run docker:test:down
```
