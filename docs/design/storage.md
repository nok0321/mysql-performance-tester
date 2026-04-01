# SQLite ストレージ設計

## 概要

Web API サーバーのデータストアを JSON ファイルから SQLite (better-sqlite3) に移行。ACID トランザクション、効率的なクエリ、WAL mode による読み書き並行性を実現。

---

## 技術選定

### better-sqlite3 を選んだ理由

| 要件 | better-sqlite3 の利点 |
|------|----------------------|
| **同期 API** | Express のリクエストハンドラ内で直感的に使える。async/await のオーバーヘッドなし |
| **ネイティブ速度** | C++ バインディングによる高速な読み書き |
| **WAL mode** | 読み取りと書き込みの並行実行が可能。単一プロセス内で十分な性能 |
| **ゼロ設定** | サーバープロセス不要。ファイルベースで起動即使用 |
| **トランザクション** | ACID 準拠。JSON ファイルの mutex では実現できなかった堅牢性 |

---

## スキーマ

### connections テーブル

接続情報を管理。パスワードは AES-256-GCM で暗号化して保存。

```sql
CREATE TABLE connections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  host        TEXT NOT NULL DEFAULT 'localhost',
  port        INTEGER NOT NULL DEFAULT 3306,
  database_   TEXT NOT NULL,
  user_       TEXT NOT NULL,
  password    TEXT,           -- AES-256-GCM encrypted
  pool_size   INTEGER NOT NULL DEFAULT 5,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

### sql_items テーブル

SQL スニペットライブラリ。タグは JSON テキストとして保存。

```sql
CREATE TABLE sql_items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sql         TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  tags        TEXT DEFAULT '[]',   -- JSON array as text
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

### query_events テーブル

クエリ実行履歴のタイムラインイベント。fingerprint にインデックスを設定。

```sql
CREATE TABLE query_events (
  id                TEXT PRIMARY KEY,
  query_fingerprint TEXT NOT NULL,
  label             TEXT,
  type              TEXT NOT NULL,
  timestamp         TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX idx_query_events_fingerprint ON query_events(query_fingerprint);
```

### _meta テーブル

スキーマバージョンとマイグレーション状態を管理する key-value ストア。

```sql
CREATE TABLE _meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

---

## 自動マイグレーション

起動時に既存の JSON ファイルを検出し、自動的に SQLite へ移行する。

### マイグレーションフロー

```
Server startup
│
├── 1. SQLite DB が存在するか？
│      ├── No  → スキーマ作成
│      └── Yes → スキーマバージョン確認
│
├── 2. JSON ファイルが存在するか？
│      ├── connections.json → connections テーブルへ挿入
│      ├── sql-store.json   → sql_items テーブルへ挿入
│      └── query-events.json → query_events テーブルへ挿入
│
├── 3. マイグレーション完了
│      └── JSON ファイルを *.json.migrated にリネーム
│
└── 4. _meta にバージョン記録
```

### 安全性

- マイグレーションはトランザクション内で実行（途中失敗時はロールバック）
- 元の JSON ファイルは削除せずリネーム（`.json.migrated`）で保持
- 既にマイグレーション済みの場合はスキップ

---

## API 互換性

ストアの公開 API（関数シグネチャ）は JSON ファイル版から変更なし。ルートファイル（`web/routes/`）の修正は不要。

```typescript
// Before (JSON file)
export function getConnections(): Connection[] { ... }
export function saveConnection(conn: Connection): void { ... }

// After (SQLite) — 同じインターフェース
export function getConnections(): Connection[] { ... }
export function saveConnection(conn: Connection): void { ... }
```

---

## ファイル構成

```
web/store/
├── database.ts           # DB 初期化、スキーマ作成、JSON マイグレーション
├── connections-store.ts   # 接続情報 CRUD
├── sql-store.ts           # SQL スニペット CRUD
└── events-store.ts        # クエリイベント CRUD
```

---

## テスト

`:memory:` データベースを使用した高速ユニットテスト。

```typescript
// tests/store/database.test.ts
import Database from 'better-sqlite3';

const db = new Database(':memory:');
// スキーマ作成 → テストデータ挿入 → 検証
// テスト終了時に自動破棄（メモリ上のため）
```

- ファイル I/O なし — CI 環境でもクリーンに実行可能
- 各テストケースで新しい `:memory:` DB を作成 — テスト間の依存なし
