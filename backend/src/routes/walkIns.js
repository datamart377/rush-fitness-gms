const express = require('express');
const { body, param, query: q } = require('express-validator');

const { pool, withTx } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');
const { insert, updateById, getById, deleteById, parsePagination, camelize } = require('../utils/crud');

const router = express.Router();
const TABLE = 'walk_ins';
const FIELDS = [
  'full_name', 'phone', 'visit_date', 'activity_id', 'amount',
  'payment_status', 'checked_in', 'checked_in_at', 'recorded_by', 'notes',
];

router.use(requireAuth);

router.get(
  '/',
  validate([
    q('date').optional().isISO8601(),
    q('paymentStatus').optional().isIn(['pending', 'paid', 'refunded']),
  ]),
  asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const params = [];
  const conds = [];
  if (req.query.date) { params.push(req.query.date); conds.push(`visit_date = $${params.length}`); }
  if (req.query.paymentStatus) { params.push(req.query.paymentStatus); conds.push(`payment_status = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await pool.query(
    `SELECT * FROM ${TABLE} ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM ${TABLE} ${where}`, params);
  res.json({ data: r.rows.map(camelize), pagination: { total: c.rows[0].n, limit, offset } });
}));

router.get('/:id', validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  res.json(await getById(pool, TABLE, req.params.id));
}));

router.post(
  '/',
  requireRole('admin', 'manager', 'receptionist'),
  validate([
    body('fullName').isString().trim().notEmpty(),
    body('amount').optional().isFloat({ min: 0 }),
    body('phone').optional({ checkFalsy: true }).isString(),
    body('paymentStatus').optional().isIn(['pending', 'paid', 'refunded']),
    body('checkedIn').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      const body = { ...req.body, recordedBy: req.user.id };
      // If client said "checkedIn: true", also stamp checked_in_at server-side
      if (body.checkedIn) body.checkedInAt = new Date().toISOString();

      const row = await insert(client, TABLE, body, FIELDS);

      // If created already-checked-in, also log an attendance row.
      if (row.checkedIn) {
        await client.query(
          `INSERT INTO attendance
              (member_id, walk_in_id, guest_name, source, recorded_by, visit_date, check_in_at, activity_id)
           VALUES (NULL, $1, $2, 'walkin', $3, $4, NOW(), $5)`,
          [row.id, row.fullName || 'Walk-In Guest', req.user.id, row.visitDate || row.visit_date, row.activityId || null]
        );
      }
      return row;
    });
    await audit(req, 'walk_in.create', TABLE, out.id);
    res.status(201).json(out);
  })
);

router.patch(
  '/:id',
  requireRole('admin', 'manager', 'receptionist'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const row = await updateById(pool, TABLE, req.params.id, req.body, FIELDS);
    await audit(req, 'walk_in.update', TABLE, row.id);
    res.json(row);
  })
);

router.post(
  '/:id/check-in',
  requireRole('admin', 'manager', 'receptionist'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      // Mark the walk-in as checked-in
      const r = await client.query(
        `UPDATE ${TABLE} SET checked_in = TRUE, checked_in_at = NOW()
           WHERE id = $1 AND checked_in = FALSE RETURNING *`,
        [req.params.id]
      );
      if (!r.rowCount) throw new ApiError(409, 'Walk-in already checked in or not found');
      const wi = r.rows[0];

      // Also create a corresponding row in `attendance` so this guest shows up
      // in the Attendance Log alongside members. member_id stays NULL,
      // walk_in_id + guest_name carry the identity.
      await client.query(
        `INSERT INTO attendance
            (member_id, walk_in_id, guest_name, source, recorded_by, visit_date, check_in_at, activity_id)
         VALUES (NULL, $1, $2, 'staff', $3, $4, NOW(), $5)`,
        [wi.id, wi.full_name || 'Walk-In Guest', req.user.id, wi.visit_date, wi.activity_id || null]
      );

      return wi;
    });
    await audit(req, 'walk_in.check_in', TABLE, req.params.id);
    res.json(camelize(out));
  })
);

router.delete('/:id', requireRole('admin'), validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  await deleteById(pool, TABLE, req.params.id);
  await audit(req, 'walk_in.delete', TABLE, req.params.id);
  res.status(204).send();
}));

module.exports = router;
