const express = require('express');
const { body, param, query: q } = require('express-validator');

const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../utils/audit');
const { insert, getById, deleteById, parsePagination, camelize } = require('../utils/crud');

const router = express.Router();
const TABLE = 'expenses';
const FIELDS = ['category', 'description', 'amount', 'spent_on', 'paid_by', 'receipt_url', 'recorded_by'];

router.use(requireAuth);

router.get(
  '/',
  validate([
    q('from').optional().isISO8601(),
    q('to').optional().isISO8601(),
    q('category').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const params = [];
    const conds = [];
    if (req.query.from) { params.push(req.query.from); conds.push(`spent_on >= $${params.length}`); }
    if (req.query.to)   { params.push(req.query.to);   conds.push(`spent_on <= $${params.length}`); }
    if (req.query.category) { params.push(req.query.category); conds.push(`category = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT * FROM ${TABLE} ${where} ORDER BY spent_on DESC, created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM ${TABLE} ${where}`, params);
    res.json({ data: r.rows.map(camelize), pagination: { total: c.rows[0].n, limit, offset } });
  })
);

router.get('/:id', validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  res.json(await getById(pool, TABLE, req.params.id));
}));

router.post(
  '/',
  requireRole('admin', 'manager'),
  validate([
    body('category').isString().trim().notEmpty(),
    body('amount').isFloat({ min: 0 }),
    body('spentOn').optional().isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const body = { ...req.body, recordedBy: req.user.id };
    const row = await insert(pool, TABLE, body, FIELDS);
    await audit(req, 'expense.create', TABLE, row.id);
    res.status(201).json(row);
  })
);

router.delete('/:id', requireRole('admin'), validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  await deleteById(pool, TABLE, req.params.id);
  await audit(req, 'expense.delete', TABLE, req.params.id);
  res.status(204).send();
}));

module.exports = router;
