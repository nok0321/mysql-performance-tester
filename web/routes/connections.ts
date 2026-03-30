/**
 * connections.ts - Connection management routes
 * GET/POST/PUT/DELETE /api/connections
 * POST /api/connections/:id/test  -- connectivity check
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as store from '../store/connections-store.js';
import { DatabaseConnection } from '../../lib/core/database-connection.js';
import { createDbConfig } from '../../lib/config/database-configuration.js';
import { validateId } from '../security/validate-id.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router: Router = Router();

/** List all connections */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const connections = await store.getAll();
  res.json({ success: true, data: connections });
}));

/** Create a connection */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name, host, port, database, user, password, poolSize } = req.body as store.CreateConnectionInput;
  if (!host || !database || !user) {
    res.status(400).json({
      success: false,
      error: 'host, database, user は必須です'
    });
    return;
  }
  const created = await store.create({ name, host, port, database, user, password, poolSize });
  res.status(201).json({ success: true, data: created });
}));

/** Update a connection */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = validateId(req.params.id as string, '接続ID');
  const updated = await store.update(id, req.body as store.UpdateConnectionInput);
  if (!updated) {
    res.status(404).json({ success: false, error: '接続が見つかりません' });
    return;
  }
  res.json({ success: true, data: updated });
}));

/** Delete a connection */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = validateId(req.params.id as string, '接続ID');
  const deleted = await store.remove(id);
  if (!deleted) {
    res.status(404).json({ success: false, error: '接続が見つかりません' });
    return;
  }
  res.json({ success: true });
}));

/** Test connectivity (SELECT 1) */
router.post('/:id/test', asyncHandler(async (req: Request, res: Response) => {
  const id = validateId(req.params.id as string, '接続ID');
  const connectionData = await store.getById(id);
  if (!connectionData) {
    res.status(404).json({ success: false, error: '接続が見つかりません' });
    return;
  }

  const dbConfig = createDbConfig({
    host:     connectionData.host,
    port:     connectionData.port,
    user:     connectionData.user,
    password: connectionData.password,
    database: connectionData.database,
  });

  let db: DatabaseConnection | null = null;
  try {
    db = new DatabaseConnection(dbConfig);
    await db.initialize();
    const connected = await db.testConnection(3);

    if (connected) {
      res.json({
        success: true,
        data: {
          connected: true,
          serverVersion: db.getServerVersion(),
          supportsExplainAnalyze: db.isExplainAnalyzeSupported()
        }
      });
    } else {
      res.status(503).json({ success: false, error: 'MySQL への接続に失敗しました' });
    }
  } catch {
    res.status(503).json({ success: false, error: 'MySQL への接続に失敗しました' });
  } finally {
    if (db) await db.close();
  }
}));

export default router;
