const express = require('express');
const { body, param, query: q } = require('express-validator');

const { pool, withTx } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');
const { camelize, parsePagination } = require('../utils/crud');

const router = express.Router();
const TABLE = 'attendance';

router.use(requireAuth);

// LIST  — supports ?date=YYYY-MM-DD and ?memberId
router.get(
  '/',
  validate([
    q('date').optional().isISO8601(),
    q('memberId').optional().isUUID(),
  ]),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const params = [];
    const conds = [];
    if (req.query.date)     { params.push(req.query.date);     conds.push(`a.visit_date = $${params.length}`); }
    if (req.query.memberId) { params.push(req.query.memberId); conds.push(`a.member_id = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT a.*,
              m.first_name AS member_first_name,
              m.last_name  AS member_last_name,
              w.full_name  AS walk_in_name,
              w.phone      AS walk_in_phone
         FROM ${TABLE} a
         LEFT JOIN members m  ON m.id = a.member_id
         LEFT JOIN walk_ins w ON w.id = a.walk_in_id
         ${where}
         ORDER BY a.check_in_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const c = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ${TABLE} a ${where}`,
      params
    );
    res.json({ data: r.rows.map(camelize), pagination: { total: c.rows[0].n, limit, offset } });
  })
);

// CHECK-IN  — refuses if member already has an open check-in today.
router.post(
  '/check-in',
  validate([
    body('memberId').isUUID(),
    body('lockerId').optional({ checkFalsy: true }).isUUID(),
    body('activityId').optional({ checkFalsy: true }).isUUID(),
    body('source').optional().isIn(['staff', 'self', 'kiosk']),
  ]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      // Member must be active.
      const m = await client.query('SELECT id, is_active FROM members WHERE id = $1', [req.body.memberId]);
      if (!m.rowCount) throw new ApiError(404, 'Member not found');
      if (!m.rows[0].is_active) throw new ApiError(409, 'Member is inactive');

      // Use today's most recent active membership for convenience.
      const ms = await client.query(
        `SELECT id FROM memberships
          WHERE member_id = $1 AND status = 'active' AND CURRENT_DATE BETWEEN start_date AND end_date
          ORDER BY end_date DESC LIMIT 1`,
        [req.body.memberId]
      );
      const membershipId = ms.rows[0]?.id || null;

      const today = new Date().toISOString().split('T')[0];
      const dup = await client.query(
        `SELECT id FROM attendance WHERE member_id = $1 AND visit_date = $2 AND check_out_at IS NULL LIMIT 1`,
        [req.body.memberId, today]
      );
      if (dup.rowCount) throw new ApiError(409, 'Member is already checked in today');

      const ins = await client.query(
        `INSERT INTO attendance
            (member_id, membership_id, locker_id, activity_id, source, recorded_by, visit_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          req.body.memberId,
          membershipId,
          req.body.lockerId || null,
          req.body.activityId || null,
          req.body.source || 'staff',
          req.user.id,
          today,
        ]
      );

      // If a locker was provided, occupy it.
      if (req.body.lockerId) {
        const lk = await client.query(
          `UPDATE lockers SET status = 'occupied', member_id = $1, occupied_at = NOW()
            WHERE id = $2 AND status != 'occupied'`,
          [req.body.memberId, req.body.lockerId]
        );
        if (!lk.rowCount) throw new ApiError(409, 'Locker is already occupied');
      }
      return ins.rows[0];
    });
    await audit(req, 'attendance.check_in', TABLE, out.id, { memberId: out.member_id });
    res.status(201).json(camelize(out));
  })
);

// CHECK-OUT
router.post(
  '/:id/check-out',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      const r = await client.query(
        `UPDATE attendance SET check_out_at = NOW() WHERE id = $1 AND check_out_at IS NULL RETURNING *`,
        [req.params.id]
      );
      if (!r.rowCount) throw new ApiError(409, 'Already checked out or not found');
      const att = r.rows[0];
      if (att.locker_id) {
        await client.query(
          `UPDATE lockers SET status = 'available', member_id = NULL, occupied_at = NULL WHERE id = $1`,
          [att.locker_id]
        );
      }
      return att;
    });
    await audit(req, 'attendance.check_out', TABLE, req.params.id);
    res.json(camelize(out));
  })
);

// DELETE — admin only, for corrections.
router.delete(
  '/:id',
  requireRole('admin'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const r = await pool.query('DELETE FROM attendance WHERE id = $1', [req.params.id]);
    if (!r.rowCount) throw new ApiError(404, 'Attendance not found');
    await audit(req, 'attendance.delete', TABLE, req.params.id);
    res.status(204).send();
  })
);

module.exports = router;
