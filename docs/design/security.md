# セキュリティ設計

## パスワード暗号化

```
Algorithm:  AES-256-GCM (AEAD)
Key:        scrypt(ENCRYPTION_KEY, random_salt, 32 bytes)
Format:     enc:<salt_b64>:<iv_b64>:<authTag_b64>:<ciphertext_b64>

Properties:
- Random salt per encryption (prevents rainbow tables)
- Random IV per encryption (128-bit GCM nonce)
- Auth tag verification (detects tampering)
- Backward compatibility: auto-detects plain text & v1 format
```

---

## API セキュリティ

| 対策 | 実装 |
|------|------|
| **Security Headers** | Helmet.js（CSP, X-Frame-Options, etc.） |
| **CORS** | `http://localhost:5173` のみ許可 |
| **Rate Limiting** | テストエンドポイント: 10 req/min（設定可能） |
| **Input Validation** | ID: `^[a-zA-Z0-9_\-]+$` / SQL: `validateQuery()` |
| **Path Traversal** | `validateParallelDir()` が絶対パス・プロジェクト外パスを拒否 |
| **Password Masking** | API レスポンスでは `••••••••` に置換 |

---

## データストア

- `web/data/store.db` — SQLite データベース（better-sqlite3 + WAL mode）
- パスワードは AES-256-GCM で暗号化して保存
- gitignore 対象

---

## WebSocket 認証

### ワンタイムトークン方式

WebSocket 接続時の認証にワンタイムトークンを使用する。

#### フロー

```
1. Client → POST /api/ws-token
   ├── Rate Limiting 適用
   └── Response: { token: "abc123..." }

2. Client → ws://localhost:3001?token=abc123...
   ├── Server: トークンを検証
   ├── 有効 → WebSocket 接続確立
   └── 無効/期限切れ → 接続拒否 (401)
```

#### トークンの特性

| 項目 | 値 |
|------|------|
| **有効期限** | 60秒 |
| **使用回数** | 1回（使い切り） |
| **生成方式** | `crypto.randomBytes()` によるセキュアランダム |
| **保存場所** | サーバーメモリ（Map） |

#### localhost フォールバック

開発環境の利便性のため、localhost からの接続はトークンなしでも許可する:

- `127.0.0.1` / `::1` / `::ffff:127.0.0.1` からの接続
- 本番環境では環境変数 `WS_AUTH_REQUIRED=true` で無効化可能

#### 実装ファイル

- `web/security/ws-token.ts` — トークン生成・検証・期限管理
- `web/routes/` — `/api/ws-token` エンドポイント
- `web-ui/src/hooks/useWebSocket.ts` — クライアント側トークン取得・接続
