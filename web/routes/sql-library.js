/**
 * sql-library.js - SQL ライブラリルート
 * GET/POST/PUT/DELETE /api/sql
 * GET /api/sql/categories
 */

import { Router } from 'express';
import * as store from '../store/sql-store.js';
import { validateId } from '../security/validate-id.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

const SQL_MAX_SIZE = 100_000; // 100KB

/** SQL 一覧（フィルタ対応） */
router.get('/', asyncHandler(async (req, res) => {
  const { category, keyword } = req.query;
  const items = await store.getAll({ category, keyword });
  res.json({ success: true, data: items });
}));

/** カテゴリ一覧 */
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await store.getCategories();
  res.json({ success: true, data: categories });
}));

/** SQL 詳細 */
router.get('/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'SQL ID');
  const item = await store.getById(id);
  if (!item) {
    return res.status(404).json({ success: false, error: 'SQL が見つかりません' });
  }
  res.json({ success: true, data: item });
}));

/** SQL 追加 */
router.post('/', asyncHandler(async (req, res) => {
  const { name, sql, category, description, tags } = req.body;
  if (!sql || !sql.trim()) {
    return res.status(400).json({ success: false, error: 'sql は必須です' });
  }
  if (sql.length > SQL_MAX_SIZE) {
    return res.status(400).json({ success: false, error: `SQL は ${SQL_MAX_SIZE} 文字以内にしてください` });
  }
  const created = await store.create({ name, sql, category, description, tags });
  res.status(201).json({ success: true, data: created });
}));

/** SQL 更新 */
router.put('/:id', asyncHandler(async (req, res) => {
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
}));

/** SQL 削除 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'SQL ID');
  const deleted = await store.remove(id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'SQL が見つかりません' });
  }
  res.json({ success: true });
}));

export default router;
