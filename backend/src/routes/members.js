const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, query: q } = require('express-validator');

const { pool, query } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');
const { insert, updateById, getById, deleteById, parsePagination, camelize } = require('../utils/crud');

const router = express.Router();
const TABLE = 'members';

// Columns that staff are allowed to set/update.
const FIELDS = [
  'first_name', 'last_name', 'phone', 'email', 'gender', 'dob',
  'national_id', 'emergency_name', 'emergency_phone', 'emergency_phone_2',
  'photo_url', 'notes', 'is_active', 'member_code', 'joined_on',
];

router.use(requireAuth);

// ── GET /api/members  (with optional ?search=...&active=true) ─────
router.get(
  '/',
  validate([
    q('search').optional().isString().trim(),
    q('active').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const params = [];
    const conds = [];
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      conds.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (req.query.active != null) {
      params.push(req.query.active === 'true');
      conds.push(`is_active = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rowsR = await query(
      `SELECT id, member_code, first_name, last_name, phone, email, gender, dob,
              national_id, emergency_name, emergency_phone, emergency_phone_2,
              photo_url, notes, is_active, joined_on, created_at, updated_at
         FROM ${TABLE} ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countR = await query(`SELECT COUNT(*)::int AS n FROM ${TABLE} ${where}`, params);

    res.json({
      data: rowsR.rows.map(camelize),
      pagination: { total: countR.rows[0].n, limit, offset },
    });
  })
);

// ── GET /api/members/:id ──────────────────────────────────────────
router.get(
  '/:id',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const m = await getById(pool, TABLE, req.params.id);
    res.json(m);
  })
);

// ── POST /api/members ─────────────────────────────────────────────
router.post(
  '/',
  requireRole('admin', 'manager', 'receptionist'),
  validate([
    body('firstName').isString().trim().notEmpty(),
    body('lastName').isString().trim().notEmpty(),
    body('phone').isString().trim().notEmpty(),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('gender').optional({ checkFalsy: true }).isIn(['Male', 'Female', 'Other']),
    body('dob').optional({ checkFalsy: true }).isISO8601(),
    body('pin').optional({ checkFalsy: true }).isString().isLength({ min: 4, max: 12 }),
  ]),
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    let pinHash = null;
    if (body.pin) {
      pinHash = await bcrypt.hash(String(body.pin), Number(process.env.BCRYPT_ROUNDS || 10));
    }
    delete body.pin;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await insert(client, TABLE, body, FIELDS);
      if (pinHash) {
        await client.query('UPDATE members SET pin_hash = $1 WHERE id = $2', [pinHash, created.id]);
        created.pinHash = '***';
      }
      await client.query('COMMIT');
      await audit(req, 'member.create', TABLE, created.id);
      res.status(201).json(created);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ── PATCH /api/members/:id ────────────────────────────────────────
router.patch(
  '/:id',
  requireRole('admin', 'manager', 'receptionist'),
  validate([
    param('id').isUUID(),
    body('firstName').optional().isString().trim().notEmpty(),
    body('lastName').optional().isString().trim().notEmpty(),
    body('phone').optional().isString().trim().notEmpty(),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('gender').optional({ checkFalsy: true }).isIn(['Male', 'Female', 'Other']),
    body('dob').optional({ checkFalsy: true }).isISO8601(),
    body('pin').optional({ checkFalsy: true }).isString().isLength({ min: 4, max: 12 }),
  ]),
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    let pinHash = null;
    if (body.pin) {
      pinHash = await bcrypt.hash(String(body.pin), Number(process.env.BCRYPT_ROUNDS || 10));
    }
    delete body.pin;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = Object.keys(body).length
        ? await updateById(client, TABLE, req.params.id, body, FIELDS)
        : await getById(client, TABLE, req.params.id);
      if (pinHash) {
        await client.query('UPDATE members SET pin_hash = $1 WHERE id = $2', [pinHash, req.params.id]);
      }
      await client.query('COMMIT');
      await audit(req, 'member.update', TABLE, req.params.id);
      res.json(updated);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ── DELETE /api/members/:id  (admin only — usually deactivate instead) ─
router.delete(
  '/:id',
  requireRole('admin'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    await deleteById(pool, TABLE, req.params.id);
    await audit(req, 'member.delete', TABLE, req.params.id);
    res.status(204).send();
  })
);

// ── POST /api/members/:id/verify-pin  (used by self check-in kiosk) ─
router.post(
  '/:id/verify-pin',
  validate([param('id').isUUID(), body('pin').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    const r = await query('SELECT pin_hash FROM members WHERE id = $1 AND is_active = TRUE', [req.params.id]);
    if (!r.rowCount || !r.rows[0].pin_hash) throw new ApiError(404, 'Member not found or no PIN set');
    const ok = await bcrypt.compare(String(req.body.pin), r.rows[0].pin_hash);
    if (!ok) throw new ApiError(401, 'Invalid PIN');
    res.json({ ok: true });
  })
);

module.exports = router;
