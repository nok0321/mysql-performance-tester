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
import { WebSocketServer } from 'ws';
import type { WebSocket as WsWebSocket } from 'ws';

import { createApp } from './app.js';
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

// ─── Terminal event cache ────────────────────────────────────────────────
const terminalEventCache = new Map<string, TerminalEvent>();

// ─── Create Express app ─────────────────────────────────────────────────
// HTTP server and WSS are created here, then passed to createApp
const app = createApp({
  terminalEventCache: terminalEventCache as Map<string, unknown>,
});

// ─── Create HTTP server and share with WebSocket ─────────────────────────
const httpServer = createServer(app);
const wss: ExtendedWebSocketServer = new WebSocketServer({ server: httpServer });

// Attach WSS to the app (routes read it via req.app.get('wss'))
app.set('wss', wss);

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
      console.warn(`[WS] Malformed message from ${clientIp}: ${raw.toString().slice(0, 100)}`);
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
