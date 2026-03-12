/**
 * sql-library.js - SQL ライブラリルート
 * GET/POST/PUT/DELETE /api/sql
 * GET /api/sql/categories
 */

import { Router } from 'express';
import * as store from '../store/sql-store.js';
import { validateId, handleIdError } from '../security/validate-id.js';

const router = Router();

const SQL_MAX_SIZE = 100_000; // 100KB

/** SQL 一覧（フィルタ対応） */
router.get('/', async (req, res) => {
  try {
    const { category, keyword } = req.query;
    const items = await store.getAll({ category, keyword });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** カテゴリ一覧 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await store.getCategories();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** SQL 詳細 */
router.get('/:id', async (req, res) => {
  try {
    const id = validateId(req.params.id, 'SQL ID');
    const item = await store.getById(id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'SQL が見つかりません' });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    if (err.status) return handleIdError(err, res);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** SQL 追加 */
router.post('/', async (req, res) => {
  try {
    const { name, sql, category, description, tags } = req.body;
    if (!sql || !sql.trim()) {
      return res.status(400).json({ success: false, error: 'sql は必須です' });
    }
    if (sql.length > SQL_MAX_SIZE) {
      return res.status(400).json({ success: false, error: `SQL は ${SQL_MAX_SIZE} 文字以内にしてください` });
    }
    const created = await store.create({ name, sql, category, description, tags });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** SQL 更新 */
router.put('/:id', async (req, res) => {
  try {
    const id = validateId(req.params.id, 'SQL ID');
    const { sql } = req.body;
    if (sql !== undefined && sql.length > SQL_MAX_SIZE) {
      return res.status(400).json({ success: false, error: `SQL は ${SQL_MAX_SIZE} 文字以内にしてください` });
    }
    const updated = await store.update(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'SQL が見つかりません' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.status) return handleIdError(err, res);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

/** SQL 削除 */
router.delete('/:id', async (req, res) => {
  try {
    const id = validateId(req.params.id, 'SQL ID');
    const deleted = await store.remove(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'SQL が見つかりません' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.status) return handleIdError(err, res);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }
});

export default router;
