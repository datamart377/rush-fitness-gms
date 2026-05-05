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
const TABLE = 'memberships';
const FIELDS = [
  'member_id', 'plan_id', 'start_date', 'end_date', 'total_due',
  'total_paid', 'frozen_days', 'status', 'created_by',
];

router.use(requireAuth);

// LIST — joins plan + member for convenience.
router.get(
  '/',
  validate([
    q('memberId').optional().isUUID(),
    q('status').optional().isIn(['active', 'expired', 'frozen', 'cancelled']),
  ]),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const params = [];
    const conds = [];
    if (req.query.memberId) { params.push(req.query.memberId); conds.push(`m.member_id = $${params.length}`); }
    if (req.query.status)   { params.push(req.query.status);   conds.push(`m.status = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT m.*,
              p.code  AS plan_code,
              p.name  AS plan_name,
              mb.first_name AS member_first_name,
              mb.last_name  AS member_last_name
         FROM memberships m
         JOIN plans p   ON p.id = m.plan_id
         JOIN members mb ON mb.id = m.member_id
         ${where}
         ORDER BY m.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM memberships m ${where}`, params);

    res.json({ data: r.rows.map(camelize), pagination: { total: c.rows[0].n, limit, offset } });
  })
);

router.get('/:id', validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  res.json(await getById(pool, TABLE, req.params.id));
}));

// CREATE — derives end_date from plan.duration_days if not supplied.
//
// Refuses to create a membership whose date range overlaps an existing
// non-finalized membership for the same member. "Non-finalized" means status
// IN ('active', 'frozen') — a cancelled or expired row no longer holds the
// slot. This prevents the duplicate-membership pattern we saw in production
// (one member with overlapping Monthly Gym + Monthly Gym+Steam etc.). If
// staff want to upgrade mid-plan, they should cancel the old row first.
router.post(
  '/',
  requireRole('admin', 'manager', 'receptionist'),
  validate([
    body('memberId').isUUID(),
    body('planId').isUUID(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('totalDue').optional().isFloat({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      const planR = await client.query('SELECT * FROM plans WHERE id = $1 AND is_active = TRUE', [req.body.planId]);
      if (!planR.rowCount) throw new ApiError(404, 'Plan not found or inactive');
      const plan = planR.rows[0];

      const start = req.body.startDate ? new Date(req.body.startDate) : new Date();
      let end;
      if (req.body.endDate) {
        end = new Date(req.body.endDate);
      } else {
        end = new Date(start);
        end.setDate(end.getDate() + plan.duration_days);
      }
      const startYMD = start.toISOString().split('T')[0];
      const endYMD = end.toISOString().split('T')[0];

      // ── Overlap guard ─────────────────────────────────────────────
      // Two date ranges overlap when A.start <= B.end AND A.end >= B.start.
      // We lock the offending rows FOR UPDATE so a concurrent assign can't
      // race past this check.
      const dup = await client.query(
        `SELECT m.id, m.start_date, m.end_date, m.status,
                p.name AS plan_name
           FROM memberships m
           JOIN plans p ON p.id = m.plan_id
          WHERE m.member_id = $1
            AND m.status IN ('active','frozen')
            AND m.start_date <= $3::date
            AND m.end_date   >= $2::date
          ORDER BY m.created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [req.body.memberId, startYMD, endYMD]
      );
      if (dup.rowCount) {
        const d = dup.rows[0];
        const fmt = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
        throw new ApiError(
          409,
          `This member already has an active membership (${d.plan_name}, ${fmt(d.start_date)} → ${fmt(d.end_date)}) that overlaps the requested dates. Cancel or wait for it to expire before assigning a new plan.`
        );
      }

      const totalDue = req.body.totalDue != null ? req.body.totalDue : plan.price;

      const payload = {
        memberId: req.body.memberId,
        planId: req.body.planId,
        startDate: startYMD,
        endDate: endYMD,
        totalDue,
        createdBy: req.user.id,
      };
      const row = await insert(client, TABLE, payload, FIELDS);
      return row;
    });
    await audit(req, 'membership.create', TABLE, out.id);
    res.status(201).json(out);
  })
);

router.patch(
  '/:id',
  requireRole('admin', 'manager'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const row = await updateById(pool, TABLE, req.params.id, req.body, FIELDS);
    await audit(req, 'membership.update', TABLE, row.id);
    res.json(row);
  })
);

// FREEZE — extends end_date by N days and sets status to frozen.
router.post(
  '/:id/freeze',
  requireRole('admin', 'manager'),
  validate([param('id').isUUID(), body('days').isInt({ min: 1, max: 365 })]),
  asyncHandler(async (req, res) => {
    const r = await pool.query(
      `UPDATE ${TABLE}
          SET status = 'frozen',
              frozen_days = frozen_days + $1::int,
              end_date = end_date + $1::int
        WHERE id = $2 RETURNING *`,
      [req.body.days, req.params.id]
    );
    if (!r.rowCount) throw new ApiError(404, 'Membership not found');
    await audit(req, 'membership.freeze', TABLE, req.params.id, { days: req.body.days });
    res.json(camelize(r.rows[0]));
  })
);

// UNFREEZE
router.post(
  '/:id/unfreeze',
  requireRole('admin', 'manager'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const r = await pool.query(
      `UPDATE ${TABLE} SET status = 'active' WHERE id = $1 AND status = 'frozen' RETURNING *`,
      [req.params.id]
    );
    if (!r.rowCount) throw new ApiError(409, 'Membership is not currently frozen');
    await audit(req, 'membership.unfreeze', TABLE, req.params.id);
    res.json(camelize(r.rows[0]));
  })
);

// CANCEL
router.post(
  '/:id/cancel',
  requireRole('admin', 'manager'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const r = await pool.query(
      `UPDATE ${TABLE} SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rowCount) throw new ApiError(404, 'Membership not found');
    await audit(req, 'membership.cancel', TABLE, req.params.id);
    res.json(camelize(r.rows[0]));
  })
);

router.delete('/:id', requireRole('admin'), validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  await deleteById(pool, TABLE, req.params.id);
  await audit(req, 'membership.delete', TABLE, req.params.id);
  res.status(204).send();
}));

module.exports = router;
