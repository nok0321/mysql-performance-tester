/**
 * sql-library.ts - SQL library routes
 * GET/POST/PUT/DELETE /api/sql
 * GET /api/sql/categories
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as store from '../store/sql-store.js';
import { validateId } from '../security/validate-id.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router: Router = Router();

const SQL_MAX_SIZE = 100_000; // 100KB

/** List SQL snippets (with filter support) */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { category, keyword } = req.query as { category?: string; keyword?: string };
  const items = await store.getAll({ category, keyword });
  res.json({ success: true, data: items });
}));

/** List categories */
router.get('/categories', asyncHandler(async (_req: Request, res: Response) => {
  const categories = await store.getCategories();
  res.json({ success: true, data: categories });
}));

/** Get SQL snippet detail */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = validateId(req.params.id as string, 'SQL ID');
  const item = await store.getById(id);
  if (!item) {
    res.status(404).json({ success: false, error: 'SQL が見つかりません' });
    return;
  }
  res.json({ success: true, data: item });
}));

/** Create a SQL snippet */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name, sql, category, description, tags } = req.body as store.CreateSqlInput;
  if (!sql || !sql.trim()) {
    res.status(400).json({ success: false, error: 'sql は必須です' });
    return;
  }
  if (sql.length > SQL_MAX_SIZE) {
    res.status(400).json({ success: false, error: `SQL は ${SQL_MAX_SIZE} 文字以内にしてください` });
    return;
  }
  const created = await store.create({ name, sql, category, description, tags });
  res.status(201).json({ success: true, data: created });
}));

/** Update a SQL snippet */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = validateId(req.params.id as string, 'SQL ID');
  const { sql } = req.body as store.UpdateSqlInput;
  if (sql !== undefined && sql.length > SQL_MAX_SIZE) {
    res.status(400).json({ success: false, error: `SQL は ${SQL_MAX_SIZE} 文字以内にしてください` });
    return;
  }
  const updated = await store.update(id, req.body as store.UpdateSqlInput);
  if (!updated) {
    res.status(404).json({ success: false, error: 'SQL が見つかりません' });
    return;
  }
  res.json({ success: true, data: updated });
}));

/** Delete a SQL snippet */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = validateId(req.params.id as string, 'SQL ID');
  const deleted = await store.remove(id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'SQL が見つかりません' });
    return;
  }
  res.json({ success: true });
}));

export default router;
