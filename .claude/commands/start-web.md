---
description: Instructions to start the Web UI (API server + frontend)
---

# Start Web UI

Web UI を起動するための手順を案内します。
**2つのターミナルが必要です。**

## Steps

1. Web UI が現在起動しているか確認する（port 3001 / 5173 の使用状況）
2. 起動手順を案内する:

```bash
# ターミナル 1: API サーバー (port 3001)
cd web && node server.js

# ターミナル 2: フロントエンド (port 5173)
cd web-ui && npm run dev
```

3. 起動後は `http://localhost:5173` をブラウザで開くよう案内する
4. web-ui の依存関係がない場合は `cd web-ui && npm install` を先に実行するよう伝える

詳細は `docs/web-ui.md` を参照してください。
