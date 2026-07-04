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

// EDIT — admin-only, intended for fixing migrated/legacy rows.
//
// Whitelisted fields: planId, startDate, endDate, totalDue, totalPaid.
// Status / member / created_by are intentionally not editable here — use the
// freeze/unfreeze/cancel endpoints for status, and never reassign a row to a
// different member (create a new one instead).
//
// If dates change, we re-run the overlap guard against OTHER memberships for
// the same member (m.id <> :id) so admins can't accidentally re-introduce the
// duplicate-membership pattern when shuffling dates around.
router.patch(
  '/:id',
  requireRole('admin'),
  validate([
    param('id').isUUID(),
    body('planId').optional().isUUID(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('totalDue').optional().isFloat({ min: 0 }),
    body('totalPaid').optional().isFloat({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      // Lock the existing row so concurrent edits/overlap-checks see a consistent view.
      const curR = await client.query(
        `SELECT * FROM memberships WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!curR.rowCount) throw new ApiError(404, 'Membership not found');
      const cur = curR.rows[0];

      // If planId is being changed, make sure the new plan exists and is active.
      if (req.body.planId && req.body.planId !== cur.plan_id) {
        const planR = await client.query(
          'SELECT id FROM plans WHERE id = $1 AND is_active = TRUE',
          [req.body.planId]
        );
        if (!planR.rowCount) throw new ApiError(404, 'Plan not found or inactive');
      }

      // Resolve the proposed date window — fall back to the current values
      // when the patch doesn't touch them.
      const fmtDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
      const newStart = req.body.startDate ? fmtDate(new Date(req.body.startDate)) : fmtDate(cur.start_date);
      const newEnd   = req.body.endDate   ? fmtDate(new Date(req.body.endDate))   : fmtDate(cur.end_date);
      if (newEnd < newStart) {
        throw new ApiError(400, 'End date cannot be before start date');
      }

      // Overlap guard — only meaningful if dates actually changed.
      const datesChanged = newStart !== fmtDate(cur.start_date) || newEnd !== fmtDate(cur.end_date);
      if (datesChanged) {
        const dup = await client.query(
          `SELECT m.id, m.start_date, m.end_date, m.status, p.name AS plan_name
             FROM memberships m
             JOIN plans p ON p.id = m.plan_id
            WHERE m.member_id = $1
              AND m.id <> $2
              AND m.status IN ('active','frozen')
              AND m.start_date <= $4::date
              AND m.end_date   >= $3::date
            ORDER BY m.created_at DESC
            LIMIT 1
            FOR UPDATE`,
          [cur.member_id, cur.id, newStart, newEnd]
        );
        if (dup.rowCount) {
          const d = dup.rows[0];
          throw new ApiError(
            409,
            `New dates overlap another membership for this member (${d.plan_name}, ${fmtDate(d.start_date)} → ${fmtDate(d.end_date)}). Resolve that one first.`
          );
        }
      }

      // Apply the patch. updateById whitelists against FIELDS so any extra junk
      // in the body (e.g. status, memberId) is silently ignored.
      const patch = {};
      if (req.body.planId    !== undefined) patch.planId    = req.body.planId;
      if (req.body.startDate !== undefined) patch.startDate = newStart;
      if (req.body.endDate   !== undefined) patch.endDate   = newEnd;
      if (req.body.totalDue  !== undefined) patch.totalDue  = req.body.totalDue;
      if (req.body.totalPaid !== undefined) patch.totalPaid = req.body.totalPaid;
      if (Object.keys(patch).length === 0) {
        throw new ApiError(400, 'No editable fields supplied');
      }
      return await updateById(client, TABLE, req.params.id, patch, FIELDS);
    });
    await audit(req, 'membership.update', TABLE, out.id, { fields: Object.keys(req.body) });
    res.json(out);
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

// EXTEND — "Top Up" for a monthly-style membership. Pushes end_date out to
// `newEndDate`, bumps total_due + total_paid by `amount`, and inserts a linked
// payment row in the SAME transaction so we can't end up with money recorded
// but the date not extended (or vice versa).
//
// Deliberately not usable on prepaid/postpaid plans — those already have
// dedicated top-up / settle flows on the /payments side. Allowed for
// receptionists because members top up at the front desk; the PATCH endpoint
// on this same route stays admin-only for arbitrary edits.
router.post(
  '/:id/extend',
  requireRole('admin', 'manager', 'receptionist'),
  validate([
    param('id').isUUID(),
    body('newEndDate').isISO8601(),
    body('amount').isFloat({ min: 0 }),
    body('method').isIn(['cash', 'mpesa', 'mpesa_mtn', 'mpesa_airtel', 'card', 'bank_transfer']),
    body('notes').optional({ checkFalsy: true }).isString().isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    const fmtDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

    const result = await withTx(async (client) => {
      // Lock the membership row so concurrent extends don't stomp on each other.
      const curR = await client.query(
        `SELECT m.*, p.code AS plan_code, p.name AS plan_name
           FROM ${TABLE} m
           JOIN plans p ON p.id = m.plan_id
          WHERE m.id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!curR.rowCount) throw new ApiError(404, 'Membership not found');
      const cur = curR.rows[0];

      // Prepaid uses a running balance and postpaid uses per-visit charges;
      // neither is what "extend by N months" means. Reject early with a
      // clear message so the frontend can route the user to the right flow.
      if (cur.plan_code === 'prepaid') {
        throw new ApiError(409, 'Prepaid memberships use the balance top-up flow instead of Extend.');
      }
      if (cur.plan_code === 'postpaid') {
        throw new ApiError(409, 'Post-paid memberships use the Settle flow instead of Extend.');
      }
      if (cur.status === 'cancelled') {
        throw new ApiError(409, 'Cancelled memberships cannot be extended. Assign a new one instead.');
      }

      const newEnd = fmtDate(new Date(req.body.newEndDate));
      const curEnd = fmtDate(cur.end_date);
      if (newEnd <= curEnd) {
        throw new ApiError(400, `New end date (${newEnd}) must be after current end date (${curEnd}).`);
      }

      // Overlap guard — the extended window mustn't collide with a DIFFERENT
      // active/frozen membership for this same member.
      const dup = await client.query(
        `SELECT m.id, m.start_date, m.end_date, p.name AS plan_name
           FROM ${TABLE} m
           JOIN plans p ON p.id = m.plan_id
          WHERE m.member_id = $1
            AND m.id <> $2
            AND m.status IN ('active','frozen')
            AND m.start_date <= $4::date
            AND m.end_date   >= $3::date
          ORDER BY m.created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [cur.member_id, cur.id, curEnd, newEnd]
      );
      if (dup.rowCount) {
        const d = dup.rows[0];
        throw new ApiError(
          409,
          `Extended window overlaps another membership for this member (${d.plan_name}, ${fmtDate(d.start_date)} → ${fmtDate(d.end_date)}). Resolve that one first.`
        );
      }

      const amount = Number(req.body.amount || 0);

      // Extend end date + bump totals. total_paid is bumped explicitly here
      // (not via the /payments POST auto-increment) because we're inserting
      // the payment directly below within the same transaction.
      const upd = await client.query(
        `UPDATE ${TABLE}
            SET end_date = $1::date,
                total_due = total_due + $2,
                total_paid = total_paid + $2,
                status = CASE WHEN status = 'expired' THEN 'active' ELSE status END
          WHERE id = $3
          RETURNING *`,
        [newEnd, amount, cur.id]
      );

      // Record the payment. Same shape as the /payments POST route so
      // reconciliation and reports pick it up identically.
      const payR = await client.query(
        `INSERT INTO payments
           (member_id, membership_id, amount, currency, method, type, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, 'membership', $6, $7)
         RETURNING *`,
        [
          cur.member_id,
          cur.id,
          amount,
          process.env.CURRENCY || 'UGX',
          req.body.method,
          req.body.notes || `Extension: ${curEnd} → ${newEnd}`,
          req.user.id,
        ]
      );

      return { membership: camelize(upd.rows[0]), payment: camelize(payR.rows[0]) };
    });

    await audit(req, 'membership.extend', TABLE, req.params.id, {
      newEndDate: result.membership.endDate,
      amount: result.payment.amount,
      method: result.payment.method,
      paymentId: result.payment.id,
    });
    res.json(result);
  })
);

router.delete('/:id', requireRole('admin'), validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  await deleteById(pool, TABLE, req.params.id);
  await audit(req, 'membership.delete', TABLE, req.params.id);
  res.status(204).send();
}));

module.exports = router;
