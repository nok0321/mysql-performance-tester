/**
 * connections.js - 接続管理ルート
 * GET/POST/PUT/DELETE /api/connections
 * POST /api/connections/:id/test  ← 疎通確認
 */

import { Router } from 'express';
import * as store from '../store/connections-store.js';
import { DatabaseConnection } from '../../lib/core/database-connection.js';
import { createDbConfig } from '../../lib/config/database-configuration.js';
import { validateId, handleIdError } from '../security/validate-id.js';

const router = Router();

/** 接続一覧 */
router.get('/', async (req, res) => {
  try {
    const connections = await store.getAll();
    res.json({ success: true, data: connections });
  } catch (err) {
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** 接続追加 */
router.post('/', async (req, res) => {
  try {
    const { name, host, port, database, user, password, poolSize } = req.body;
    if (!host || !database || !user) {
      return res.status(400).json({
        success: false,
        error: 'host, database, user は必須です'
      });
    }
    const created = await store.create({ name, host, port, database, user, password, poolSize });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** 接続更新 */
router.put('/:id', async (req, res) => {
  try {
    const id = validateId(req.params.id, '接続ID');
    const updated = await store.update(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: '接続が見つかりません' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.status) return handleIdError(err, res);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** 接続削除 */
router.delete('/:id', async (req, res) => {
  try {
    const id = validateId(req.params.id, '接続ID');
    const deleted = await store.remove(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '接続が見つかりません' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.status) return handleIdError(err, res);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** 疎通確認 (SELECT 1) */
router.post('/:id/test', async (req, res) => {
  let db = null;
  try {
    const id = validateId(req.params.id, '接続ID');
    const connectionData = await store.getById(id);
    if (!connectionData) {
      return res.status(404).json({ success: false, error: '接続が見つかりません' });
    }

    const dbConfig = createDbConfig({
      host:     connectionData.host,
      port:     connectionData.port,
      user:     connectionData.user,
      password: connectionData.password,
      database: connectionData.database,
    });

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
  } catch (err) {
    res.status(503).json({ success: false, error: 'MySQL への接続に失敗しました' });
  } finally {
    if (db) await db.close();
  }
});

export default router;
