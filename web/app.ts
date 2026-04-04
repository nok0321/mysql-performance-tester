/**
 * app.ts - Express application factory
 *
 * Extracted from server.ts to enable supertest-based route testing.
 * The createApp() function builds and returns a fully configured Express app
 * without starting the HTTP server or WebSocket server.
 */

import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { WebSocketServer } from 'ws';

import connectionsRouter from './routes/connections.js';
import sqlLibraryRouter from './routes/sql-library.js';
import testsRouter from './routes/tests.js';
import reportsRouter from './routes/reports.js';
import historyRouter from './routes/history.js';
import { errorHandler } from './middleware/error-handler.js';
import { wsTokenManager } from './security/ws-token.js';

export interface CreateAppOptions {
  /** WebSocket server instance. When omitted (e.g. in tests), WSS-dependent features are no-ops. */
  wss?: WebSocketServer;
  /** Terminal event cache map. When omitted, a new empty Map is created. */
  terminalEventCache?: Map<string, unknown>;
}

/**
 * Create and configure an Express application with all middleware and routes.
 *
 * The caller is responsible for:
 * - Loading environment variables (dotenv)
 * - Validating environment (validateEnv)
 * - Initializing the database (initDb)
 * - Creating the HTTP server and WebSocket server
 * - Starting the server (listen)
 */
export function createApp(options: CreateAppOptions = {}): express.Express {
  const { wss, terminalEventCache = new Map<string, unknown>() } = options;

  const app = express();

  // ─── Middleware ───────────────────────────────────────────────────────────

  // Security headers
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

  // Make WebSocket instance accessible from routes via app
  if (wss) {
    app.set('wss', wss);
  }
  app.set('terminalEventCache', terminalEventCache);

  // Rate limit for test execution endpoints
  const testRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_TEST_MAX) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'テスト実行のリクエストが多すぎます。しばらく待ってから再試行してください。' }
  });

  // ─── API Routes ──────────────────────────────────────────────────────────
  app.use('/api/connections', connectionsRouter);
  app.use('/api/sql', sqlLibraryRouter);
  app.use('/api/tests', testRateLimit, testsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/history', historyRouter);

  // ─── WebSocket token endpoint ────────────────────────────────────────────
  const wsTokenRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many token requests. Please try again later.' }
  });
  app.get('/api/ws-token', wsTokenRateLimit, (_req: Request, res: Response) => {
    const token = wsTokenManager.generate();
    res.json({ success: true, token });
  });

  // ─── Health check ────────────────────────────────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      wsClients: wss ? wss.clients.size : 0
    });
  });

  // ─── Error handler ───────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
