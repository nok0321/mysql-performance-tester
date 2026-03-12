---
description: Add a new SQL test file to sql/ or parallel/ directory
argument-hint: "<query description> [--parallel]"
---

# Add SQL Test File

テスト用の SQL ファイルを作成して `sql/` または `parallel/` ディレクトリに追加します。

## Steps

1. ユーザーの入力 `$ARGUMENTS` からクエリ内容と配置先（`--parallel` フラグで `parallel/`、デフォルトは `sql/`）を判断する
2. 既存ファイルのプレフィックス番号（`NN_`）を確認して次の番号を決める
3. ファイル名の形式: `NN_descriptive-name.sql`（例: `05_join-with-index.sql`）
4. SQL ファイルを作成する（先頭にコメントでクエリの目的を記載すること）
5. 作成したファイルパスを報告する

## SQL File Template
```sql
-- Test: <query purpose>
-- Target table: <table name>
-- Expected: <what we're measuring>

SELECT ...
```
