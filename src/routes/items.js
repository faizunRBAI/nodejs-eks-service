'use strict';

/**
 * /api/items — CRUD resource backed by the Postgres `items` table.
 *
 * All handlers are purposely thin: validate inputs, delegate to the DB,
 * return a consistent JSON envelope. Business logic that grows beyond this
 * belongs in a dedicated service layer.
 */

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();

/** Validates that id is a positive integer. */
function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * GET /api/items
 * Returns all items ordered by creation time descending.
 * Query params: ?limit=N (default 50, max 200) ?offset=N (default 0)
 */
router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { rows, rowCount } = await pool.query(
      'SELECT id, name, description, created_at FROM items ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json({ items: rows, total: rowCount, limit, offset });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/items
 * Body: { name: string, description?: string }
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required and must be a non-empty string' });
    }
    if (name.trim().length > 255) {
      return res.status(400).json({ error: 'name must be 255 characters or fewer' });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      'INSERT INTO items (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
      [name.trim(), description ? String(description).trim() : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/items/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id must be a positive integer' });

    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, name, description, created_at FROM items WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'item not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/items/:id
 * Body: { name?: string, description?: string } — at least one field required.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id must be a positive integer' });

    const { name, description } = req.body || {};
    if (name === undefined && description === undefined) {
      return res.status(400).json({ error: 'at least one of name or description is required' });
    }
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      if (name.trim().length > 255) {
        return res.status(400).json({ error: 'name must be 255 characters or fewer' });
      }
    }

    const pool = getPool();
    // Build the SET clause dynamically so untouched columns keep their value.
    const setClauses = [];
    const params = [];
    if (name !== undefined) {
      params.push(name.trim());
      setClauses.push(`name = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description ? String(description).trim() : null);
      setClauses.push(`description = $${params.length}`);
    }
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE items SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING id, name, description, created_at`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'item not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/items/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id must be a positive integer' });

    const pool = getPool();
    const { rowCount } = await pool.query('DELETE FROM items WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'item not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
