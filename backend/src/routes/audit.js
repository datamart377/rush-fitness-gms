const express = require('express');
const { query: q } = require('express-validator');

const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { camelize, parsePagination } = require('../utils/crud');

const router = express.Router();

// Audit logs are sensitive — admin-only.
router.use(requireAuth, requireRole('admin'));

router.get(
  '/',
  validate([
    q('userId').optional().isUUID(),
    q('entityType').optional().isString(),
    q('action').optional().isString(),
    q('from').optional().isISO8601(),
    q('to').optional().isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const params = [];
    const conds = [];
    if (req.query.userId)     { params.push(req.query.userId);     conds.push(`user_id = $${params.length}`); }
    if (req.query.entityType) { params.push(req.query.entityType); conds.push(`entity_type = $${params.length}`); }
    if (req.query.action)     { params.push(req.query.action);     conds.push(`action = $${params.length}`); }
    if (req.query.from)       { params.push(req.query.from);       conds.push(`created_at >= $${params.length}`); }
    if (req.query.to)         { params.push(req.query.to);         conds.push(`created_at <= $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_logs ${where}`, params);
    res.json({ data: r.rows.map(camelize), pagination: { total: c.rows[0].n, limit, offset } });
  })
);

module.exports = router;
