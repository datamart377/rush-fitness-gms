const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param } = require('express-validator');

const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');
const { camelize, parsePagination } = require('../utils/crud');

const router = express.Router();
const TABLE = 'users';

router.use(requireAuth);

// Only admins can list / inspect users.
router.get('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const r = await pool.query(
    `SELECT id, username, email, full_name, role, phone, is_active, last_login_at, created_at
       FROM ${TABLE}
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM ${TABLE}`);
  res.json({ data: r.rows.map(camelize), pagination: { total: c.rows[0].n, limit, offset } });
}));

router.patch(
  '/:id',
  requireRole('admin'),
  validate([
    param('id').isUUID(),
    body('fullName').optional().isString().trim().notEmpty(),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('role').optional().isIn(['admin', 'manager', 'receptionist', 'trainer']),
    body('isActive').optional().isBoolean(),
    body('newPassword').optional({ checkFalsy: true }).isString().isLength({ min: 8 }),
  ]),
  asyncHandler(async (req, res) => {
    const cols = [];
    const vals = [];
    const map = { fullName: 'full_name', email: 'email', role: 'role', isActive: 'is_active', phone: 'phone' };
    for (const [k, v] of Object.entries(req.body)) {
      if (map[k]) {
        cols.push(`${map[k]} = $${cols.length + 1}`);
        vals.push(v === '' ? null : v);
      }
    }
    if (req.body.newPassword) {
      const hash = await bcrypt.hash(req.body.newPassword, Number(process.env.BCRYPT_ROUNDS || 10));
      cols.push(`password_hash = $${cols.length + 1}`);
      vals.push(hash);
    }
    if (!cols.length) throw new ApiError(400, 'No valid fields to update');
    vals.push(req.params.id);
    const r = await pool.query(
      `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${vals.length}
       RETURNING id, username, email, full_name, role, phone, is_active, last_login_at, created_at`,
      vals
    );
    if (!r.rowCount) throw new ApiError(404, 'User not found');
    await audit(req, 'user.update', TABLE, req.params.id);
    res.json(camelize(r.rows[0]));
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) throw new ApiError(400, 'You cannot delete your own account');
    const r = await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (!r.rowCount) throw new ApiError(404, 'User not found');
    await audit(req, 'user.delete', TABLE, req.params.id);
    res.status(204).send();
  })
);

module.exports = router;
