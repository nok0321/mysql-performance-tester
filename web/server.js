/**
 * server.js - MySQL Performance Tester Web API サーバー
 *
 * - Express REST API (ポート 3001)
 * - WebSocket サーバー（同一ポート）でテスト進捗をリアルタイム Push
 * - 既存の lib/ クラスを直接 import して利用（lib/ は変更なし）
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// web/ ディレクトリから起動しても、プロジェクトルートの .env を確実に読み込む
const __serverDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__serverDir, '..', '.env') });

// ─── 起動前セキュリティチェック ───────────────────────────────────────────
const _ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!_ENCRYPTION_KEY) {
    console.error('[Security] ENCRYPTION_KEY が設定されていません。起動を中止します。');
    console.error('  .env ファイルに以下を追加してください:');
    console.error('  ENCRYPTION_KEY=<32文字以上のランダム文字列>');
    process.exit(1);
}
// ENCRYPTION_KEY 最低強度チェック（H3対応）
const MIN_KEY_LENGTH = 32;
if (_ENCRYPTION_KEY.length < MIN_KEY_LENGTH) {
    console.error(`[Security] ENCRYPTION_KEY が短すぎます（現在 ${_ENCRYPTION_KEY.length} 文字、最低 ${MIN_KEY_LENGTH} 文字必要）。`);
    console.error('  openssl rand -base64 32 などで生成した強いキーを使用してください。');
    process.exit(1);
}

import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';

import connectionsRouter from './routes/connections.js';
import sqlLibraryRouter from './routes/sql-library.js';
import testsRouter from './routes/tests.js';
import reportsRouter from './routes/reports.js';

const PORT = process.env.WEB_PORT || 3001;
const app = express();

// ─── ミドルウェア ─────────────────────────────────────────────────────────

// セキュリティヘッダー（M1対応）
// localhost 専用ツールだが将来的な公開に備えて helmet を適用する。
// contentSecurityPolicy は Web UI の動的スクリプトを壊さないよう無効化。
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// テスト実行エンドポイントのレート制限（H4対応）
// 1分間に最大 10 リクエストまで（.env: RATE_LIMIT_TEST_MAX で上書き可能）
const testRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_TEST_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'テスト実行のリクエストが多すぎます。しばらく待ってから再試行してください。' }
});

// ─── HTTP サーバーを作成し WebSocket と共有 ──────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// WebSocket インスタンスをルートから利用できるよう app に保持
app.set('wss', wss);

// ─── ターミナルイベントキャッシュ ─────────────────────────────────────────
// complete / error は subscribe 到着前に broadcast される場合があるため、
// 60 秒間キャッシュして subscribe 時にリプレイする（競合状態対策）
const terminalEventCache = new Map(); // testId → { type, data, timer }
app.set('terminalEventCache', terminalEventCache);
// wss からも参照できるよう直接保持（tests.js の broadcast() から利用）
wss.terminalEventCache = terminalEventCache;

// ─── WebSocket ────────────────────────────────────────────────────────────
const LOCALHOST_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;

  // localhost 以外からの WebSocket 接続を拒否
  if (!LOCALHOST_ADDRS.has(clientIp)) {
    console.warn(`[WS] Rejected non-localhost connection from: ${clientIp}`);
    ws.close(1008, 'Forbidden');
    return;
  }

  console.log(`[WS] Client connected: ${clientIp}`);

  // testId 購読管理（broadcast() がこの Set を参照してフィルタリングする）
  ws.subscribedTestIds = new Set();

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      // クライアントから { type: 'subscribe', testId } を受け取って購読登録
      if (msg.type === 'subscribe' && typeof msg.testId === 'string') {
        ws.subscribedTestIds.add(msg.testId);
        // テスト完了後に subscribe が届いた場合: キャッシュからリプレイ
        const cached = terminalEventCache.get(msg.testId);
        if (cached && ws.readyState === 1 /* OPEN */) {
          ws.send(JSON.stringify({ type: cached.type, testId: msg.testId, data: cached.data }));
        }
      }
    } catch {
      // 不正なメッセージは無視
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${clientIp}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error: ${err.message}`);
  });

  // 接続確認メッセージ
  ws.send(JSON.stringify({ type: 'connected', data: { message: 'WebSocket connected' } }));
});

// ─── API ルート ───────────────────────────────────────────────────────────
app.use('/api/connections', connectionsRouter);
app.use('/api/sql', sqlLibraryRouter);
// テスト実行エンドポイントにレート制限を適用（H4対応）
app.use('/api/tests', testRateLimit, testsRouter);
app.use('/api/reports', reportsRouter);

// ─── ヘルスチェック ───────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    wsClients: wss.clients.size
  });
});

// ─── エラーハンドラー ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[API Error]', err);
  res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
});

// ─── 起動 ─────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🚀 MySQL Performance Tester Web API`);
  console.log(`   REST API : http://localhost:${PORT}/api`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health   : http://localhost:${PORT}/api/health\n`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);

  // 新規 WebSocket 接続を拒否し、既存クライアントを閉じる
  wss.clients.forEach(client => client.close(1001, 'Server shutting down'));

  // HTTP サーバーを停止（新規リクエストの受付を停止）
  httpServer.close((err) => {
    if (err) {
      console.error('[Server] Error during shutdown:', err.message);
      process.exit(1);
    }
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  // 一定時間内に完了しない場合は強制終了
  setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
