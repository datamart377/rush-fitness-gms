const express = require('express');
const { body, param, query: q } = require('express-validator');

const { pool, withTx } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');
const { updateById, camelize, parsePagination } = require('../utils/crud');

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

// PATCH — admin-only correction for a check-in record. Narrow whitelist:
// only fields the "Edit member check-in" modal exposes (check-in / check-out
// times, activity, locker) can be updated through here so this endpoint
// can't be used to slip an unrelated edit through (e.g., silently reassign
// the row to a different member).
//
// Locker state changes are mirrored on the lockers table so the check-in
// history stays consistent with the locker board:
//   • old locker cleared → set that locker back to `available`
//   • new locker assigned → occupy it (409 if it's already occupied)
// The whole thing runs inside withTx so a locker collision cleanly aborts
// the attendance update as well.
const EDITABLE_FIELDS = ['check_in_at', 'check_out_at', 'activity_id', 'locker_id'];
router.patch(
  '/:id',
  requireRole('admin'),
  validate([
    param('id').isUUID(),
    body('checkInAt').optional({ checkFalsy: true }).isISO8601(),
    body('checkOutAt').optional({ nullable: true }).custom((v) => v === null || v === '' || !isNaN(Date.parse(v))),
    body('activityId').optional({ nullable: true }).custom((v) => v == null || v === '' || /^[0-9a-fA-F-]{36}$/.test(v)),
    body('lockerId').optional({ nullable: true }).custom((v) => v == null || v === '' || /^[0-9a-fA-F-]{36}$/.test(v)),
  ]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      // Fetch current row so we can diff locker_id + know the member for locker updates.
      const cur = await client.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
      if (!cur.rowCount) throw new ApiError(404, 'Attendance not found');
      const before = cur.rows[0];

      // Normalise empty string → null for the nullable columns so the whitelist
      // updater writes NULL instead of choking on ''::uuid.
      const patch = { ...req.body };
      if (patch.checkOutAt === '') patch.checkOutAt = null;
      if (patch.activityId === '') patch.activityId = null;
      if (patch.lockerId === '') patch.lockerId = null;

      // Apply the row update via the shared whitelist helper. Passing the
      // client (not the pool) keeps this inside the transaction so a locker
      // conflict below rolls the attendance edit back too.
      const row = await updateById(client, TABLE, req.params.id, patch, EDITABLE_FIELDS);

      // Locker reconciliation — only touch lockers if the request changed the
      // locker_id column. Compare against `before` (raw DB value) instead of
      // the camelCase patch, so a no-op edit doesn't ping the lockers table.
      const lockerChanged = Object.prototype.hasOwnProperty.call(patch, 'lockerId') && patch.lockerId !== before.locker_id;
      if (lockerChanged) {
        if (before.locker_id) {
          // Release the old one — leave status untouched if it's already been
          // reassigned to someone else (member_id mismatch means another
          // check-in claimed it in the meantime).
          await client.query(
            `UPDATE lockers SET status = 'available', member_id = NULL, occupied_at = NULL
               WHERE id = $1 AND member_id = $2`,
            [before.locker_id, before.member_id]
          );
        }
        if (patch.lockerId) {
          const lk = await client.query(
            `UPDATE lockers SET status = 'occupied', member_id = $1, occupied_at = NOW()
               WHERE id = $2 AND status != 'occupied'`,
            [before.member_id, patch.lockerId]
          );
          if (!lk.rowCount) throw new ApiError(409, 'Locker is already occupied');
        }
      }
      return row;
    });
    await audit(req, 'attendance.update', TABLE, out.id, { memberId: out.memberId });
    res.json(out);
  })
);

// DELETE — admin only, for corrections. Cascades to same-day payments the
// check-in flow generates for this member so a deleted attendance row doesn't
// leave orphaned wallet debits / cash rows in the ledger.
//
// The join key is intentionally narrow:
//   member_id + paid_at::date = visit_date + type IN (check-in payment types)
// The type filter guards against wiping unrelated same-day cash-in (e.g.,
// a membership top-up that happened to hit today). If the member has a
// wallet debit in the deleted set we also refund the wallet so the balance
// isn't stranded — this mirrors the payments handler that spent the wallet
// at check-in time.
router.delete(
  '/:id',
  requireRole('admin'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const summary = await withTx(async (client) => {
      // Fetch the attendance row up-front so we know member_id + visit_date
      // (both needed for the cascade) and can free any occupied locker.
      const cur = await client.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
      if (!cur.rowCount) throw new ApiError(404, 'Attendance not found');
      const att = cur.rows[0];

      let paymentsRemoved = 0;
      let walletRefunded = 0;
      if (att.member_id && att.visit_date) {
        // Refund the wallet FIRST — while the addon_debit rows still exist
        // we know exactly which membership to credit back and by how much.
        // Only mutate memberships row if a membership_id is present on the
        // debit (which the check-in flow always sets — see chargeAddons in
        // App.jsx).
        const debitRows = await client.query(
          `SELECT membership_id, amount FROM payments
             WHERE member_id = $1
               AND paid_at::date = $2
               AND type = 'addon_debit'`,
          [att.member_id, att.visit_date]
        );
        for (const d of debitRows.rows) {
          if (d.membership_id) {
            await client.query(
              `UPDATE memberships SET addon_balance = addon_balance + $1 WHERE id = $2`,
              [d.amount, d.membership_id]
            );
            walletRefunded += Number(d.amount) || 0;
          }
        }

        // Wipe the check-in payment set. Same-day + narrow type list so
        // unrelated cash-in isn't caught. addon_topup is NOT included because
        // it's real money the member paid in, not a check-in artefact.
        const del = await client.query(
          `DELETE FROM payments
             WHERE member_id = $1
               AND paid_at::date = $2
               AND type IN ('prepaid_visit', 'addon_debit', 'addon', 'walk_in')
             RETURNING id`,
          [att.member_id, att.visit_date]
        );
        paymentsRemoved = del.rowCount;
      }

      // Free any locker still tied to this member via this row so the board
      // matches reality after the deletion. The member_id guard prevents
      // clobbering a locker that's since been reassigned.
      if (att.locker_id) {
        await client.query(
          `UPDATE lockers SET status = 'available', member_id = NULL, occupied_at = NULL
             WHERE id = $1 AND member_id = $2`,
          [att.locker_id, att.member_id]
        );
      }

      await client.query(`DELETE FROM ${TABLE} WHERE id = $1`, [req.params.id]);
      return { paymentsRemoved, walletRefunded };
    });
    await audit(req, 'attendance.delete', TABLE, req.params.id, summary);
    res.status(204).send();
  })
);

module.exports = router;
