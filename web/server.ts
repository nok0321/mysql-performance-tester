/**
 * server.ts - MySQL Performance Tester Web API server
 *
 * - Express REST API (port 3001)
 * - WebSocket server (same port) for real-time test progress push
 * - Imports lib/ classes directly (lib/ is unchanged)
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root even when launched from web/ directory
const __serverDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__serverDir, '..', '.env') });

// ─── Pre-startup validation ─────────────────────────────────────────────
import { validateEnv } from './middleware/env-validator.js';
validateEnv();

import { createServer } from 'http';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import type { WebSocket as WsWebSocket } from 'ws';

import connectionsRouter from './routes/connections.js';
import sqlLibraryRouter from './routes/sql-library.js';
import testsRouter from './routes/tests.js';
import reportsRouter from './routes/reports.js';
import historyRouter from './routes/history.js';
import { errorHandler } from './middleware/error-handler.js';
import { wsTokenManager } from './security/ws-token.js';
import { initDb, closeDb } from './store/database.js';

/** Extended WebSocket with subscription management */
interface SubscribableWebSocket extends WsWebSocket {
  subscribedTestIds?: Set<string>;
}

/** Terminal event cached for late subscribers */
interface TerminalEvent {
  type: string;
  data: unknown;
  timer: ReturnType<typeof setTimeout>;
}

/** Extended WebSocketServer with terminal event cache */
interface ExtendedWebSocketServer extends WebSocketServer {
  terminalEventCache?: Map<string, TerminalEvent>;
}

// ─── Initialize SQLite database ─────────────────────────────────────────
initDb();

const PORT: string | number = process.env.WEB_PORT || 3001;
const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────

// Security headers
// localhost-only tool, but helmet is applied for future public deployment.
// This API server returns JSON only, so CSP is minimally configured.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'none'"],
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
    }
  }
}));

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limit for test execution endpoints
// Max 10 requests per minute (overridable via .env: RATE_LIMIT_TEST_MAX)
const testRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_TEST_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'テスト実行のリクエストが多すぎます。しばらく待ってから再試行してください。' }
});

// ─── Create HTTP server and share with WebSocket ─────────────────────────
const httpServer = createServer(app);
const wss: ExtendedWebSocketServer = new WebSocketServer({ server: httpServer });

// Make WebSocket instance accessible from routes via app
app.set('wss', wss);

// ─── Terminal event cache ────────────────────────────────────────────────
// complete / error events may be broadcast before subscribe arrives,
// so cache for 60 seconds and replay on subscribe (race condition fix)
const terminalEventCache = new Map<string, TerminalEvent>(); // testId -> { type, data, timer }
app.set('terminalEventCache', terminalEventCache);
// Also attach directly to wss for broadcast() in tests.ts
wss.terminalEventCache = terminalEventCache;

// ─── WebSocket ───────────────────────────────────────────────────────────
const LOCALHOST_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

wss.on('connection', (ws: SubscribableWebSocket, req) => {
  const clientIp = req.socket.remoteAddress;

  // Token-based authentication for WebSocket connections
  const url = new URL(req.url || '', 'http://localhost');
  const token = url.searchParams.get('token');

  if (token) {
    // Validate one-time token (works for both local and remote clients)
    if (!wsTokenManager.validate(token)) {
      console.warn(`[WS] Rejected connection with invalid/expired token from: ${clientIp}`);
      ws.close(4001, 'Invalid or expired token');
      return;
    }
  } else {
    // Fallback: allow localhost without token (development convenience)
    if (!LOCALHOST_ADDRS.has(clientIp ?? '')) {
      console.warn(`[WS] Rejected non-localhost connection without token from: ${clientIp}`);
      ws.close(4001, 'Invalid or expired token');
      return;
    }
  }

  console.log(`[WS] Client connected: ${clientIp}`);

  // testId subscription management (broadcast() reads this Set for filtering)
  ws.subscribedTestIds = new Set();

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string; testId?: string };
      // Client sends { type: 'subscribe', testId } to register subscription
      if (msg.type === 'subscribe' && typeof msg.testId === 'string') {
        ws.subscribedTestIds!.add(msg.testId);
        // If the test already completed before subscribe: replay from cache
        const cached = terminalEventCache.get(msg.testId);
        if (cached && ws.readyState === 1 /* OPEN */) {
          ws.send(JSON.stringify({ type: cached.type, testId: msg.testId, data: cached.data }));
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${clientIp}`);
  });

  ws.on('error', (err: Error) => {
    console.error(`[WS] Error: ${err.message}`);
  });

  // Connection confirmation message
  ws.send(JSON.stringify({ type: 'connected', data: { message: 'WebSocket connected' } }));
});

// ─── API Routes ──────────────────────────────────────────────────────────
app.use('/api/connections', connectionsRouter);
app.use('/api/sql', sqlLibraryRouter);
// Apply rate limit to test execution endpoints
app.use('/api/tests', testRateLimit, testsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/history', historyRouter);

// ─── WebSocket token endpoint ────────────────────────────────────────────
app.get('/api/ws-token', (_req: Request, res: Response) => {
  const token = wsTokenManager.generate();
  res.json({ success: true, token });
});

// ─── Health check ────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    wsClients: wss.clients.size
  });
});

// ─── Error handler ───────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
httpServer.listen(Number(PORT), BIND_HOST, () => {
  console.log(`\n🚀 MySQL Performance Tester Web API`);
  console.log(`   REST API : http://${BIND_HOST}:${PORT}/api`);
  console.log(`   WebSocket: ws://${BIND_HOST}:${PORT}`);
  console.log(`   Health   : http://${BIND_HOST}:${PORT}/api/health\n`);
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────
function gracefulShutdown(signal: string): void {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);

  // Clean up token manager and close SQLite
  wsTokenManager.destroy();
  closeDb();

  // Reject new WebSocket connections and close existing clients
  wss.clients.forEach(client => client.close(1001, 'Server shutting down'));

  // Stop HTTP server (stop accepting new requests)
  httpServer.close((err) => {
    if (err) {
      console.error('[Server] Error during shutdown:', err.message);
      process.exit(1);
    }
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
