const express = require('express');
const { body, param, query: q } = require('express-validator');

const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');
const { insert, updateById, getById, deleteById, parsePagination, camelize } = require('../utils/crud');

const router = express.Router();
const TABLE = 'lockers';
const FIELDS = ['number', 'section', 'status', 'member_id', 'occupied_at', 'notes'];

router.use(requireAuth);

router.get(
  '/',
  validate([
    q('section').optional().isIn(['gents', 'ladies']),
    q('status').optional().isIn(['available', 'occupied', 'maintenance']),
  ]),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const params = [];
    const conds = [];
    if (req.query.section) {
      params.push(req.query.section);
      conds.push(`section = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      conds.push(`status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT * FROM ${TABLE} ${where} ORDER BY section, number
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
    body('number').isInt({ min: 1 }),
    body('section').isIn(['gents', 'ladies']),
    body('status').optional().isIn(['available', 'occupied', 'maintenance']),
  ]),
  asyncHandler(async (req, res) => {
    const row = await insert(pool, TABLE, req.body, FIELDS);
    await audit(req, 'locker.create', TABLE, row.id);
    res.status(201).json(row);
  })
);

router.patch(
  '/:id',
  requireRole('admin', 'manager', 'receptionist'),
  validate([
    param('id').isUUID(),
    body('status').optional().isIn(['available', 'occupied', 'maintenance']),
  ]),
  asyncHandler(async (req, res) => {
    // If status changes to available, clear member_id and occupied_at.
    const body = { ...req.body };
    if (body.status === 'available') {
      body.memberId = null;
      body.occupiedAt = null;
    }
    if (body.status === 'occupied' && !body.occupiedAt) {
      body.occupiedAt = new Date().toISOString();
    }
    const row = await updateById(pool, TABLE, req.params.id, body, FIELDS);
    await audit(req, 'locker.update', TABLE, row.id, { status: body.status });
    res.json(row);
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    await deleteById(pool, TABLE, req.params.id);
    await audit(req, 'locker.delete', TABLE, req.params.id);
    res.status(204).send();
  })
);

// ── POST /api/lockers/:id/assign  body: { memberId } ──────────────
router.post(
  '/:id/assign',
  requireRole('admin', 'manager', 'receptionist'),
  validate([param('id').isUUID(), body('memberId').isUUID()]),
  asyncHandler(async (req, res) => {
    const r = await pool.query(
      `UPDATE ${TABLE}
          SET status = 'occupied', member_id = $1, occupied_at = NOW()
        WHERE id = $2 AND status != 'occupied'
        RETURNING *`,
      [req.body.memberId, req.params.id]
    );
    if (!r.rowCount) throw new ApiError(409, 'Locker is already occupied or does not exist');
    await audit(req, 'locker.assign', TABLE, req.params.id, { memberId: req.body.memberId });
    res.json(camelize(r.rows[0]));
  })
);

// ── POST /api/lockers/:id/release ─────────────────────────────────
router.post(
  '/:id/release',
  requireRole('admin', 'manager', 'receptionist'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const r = await pool.query(
      `UPDATE ${TABLE} SET status='available', member_id=NULL, occupied_at=NULL
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rowCount) throw new ApiError(404, 'Locker not found');
    await audit(req, 'locker.release', TABLE, req.params.id);
    res.json(camelize(r.rows[0]));
  })
);

module.exports = router;
