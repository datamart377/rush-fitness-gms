const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const { query } = require('../db/pool');
const { signToken, requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

const ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

// ── POST /api/auth/login ──────────────────────────────────────────
router.post(
  '/login',
  loginLimiter,
  validate([
    body('username').isString().trim().notEmpty().withMessage('username is required'),
    body('password').isString().notEmpty().withMessage('password is required'),
  ]),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const r = await query(
      `SELECT id, username, email, password_hash, full_name, role, is_active
         FROM users WHERE username = $1`,
      [username]
    );
    const user = r.rows[0];
    if (!user || !user.is_active) {
      throw new ApiError(401, 'Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new ApiError(401, 'Invalid credentials');

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signToken(user);
    req.user = { id: user.id, username: user.username, role: user.role };
    await audit(req, 'auth.login', 'users', user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  })
);

// ── GET /api/auth/me ──────────────────────────────────────────────
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query(
      `SELECT id, username, email, full_name, role, phone, is_active, last_login_at, created_at
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!r.rows.length) throw new ApiError(404, 'User not found');
    const u = r.rows[0];
    res.json({
      id: u.id,
      username: u.username,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      phone: u.phone,
      isActive: u.is_active,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
    });
  })
);

// ── POST /api/auth/change-password ────────────────────────────────
router.post(
  '/change-password',
  requireAuth,
  validate([
    body('currentPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 8 }).withMessage('newPassword must be at least 8 characters'),
  ]),
  asyncHandler(async (req, res) => {
    const r = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!r.rows.length) throw new ApiError(404, 'User not found');
    const ok = await bcrypt.compare(req.body.currentPassword, r.rows[0].password_hash);
    if (!ok) throw new ApiError(400, 'Current password is incorrect');

    const hash = await bcrypt.hash(req.body.newPassword, ROUNDS);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    await audit(req, 'auth.password_change', 'users', req.user.id);
    res.json({ ok: true });
  })
);

// ── POST /api/auth/register  (admin-only — creates staff/users) ───
router.post(
  '/register',
  requireAuth,
  requireRole('admin'),
  validate([
    body('username').isString().trim().isLength({ min: 3, max: 50 }),
    body('password').isString().isLength({ min: 8 }),
    body('fullName').isString().trim().notEmpty(),
    body('role').isIn(['admin', 'manager', 'receptionist', 'trainer']),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('phone').optional({ checkFalsy: true }).isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { username, password, fullName, role, email, phone } = req.body;
    const hash = await bcrypt.hash(password, ROUNDS);
    const r = await query(
      `INSERT INTO users (username, password_hash, full_name, role, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, username, email, full_name, role, phone, is_active, created_at`,
      [username, hash, fullName, role, email || null, phone || null]
    );
    const u = r.rows[0];
    await audit(req, 'user.create', 'users', u.id, { role });
    res.status(201).json({
      id: u.id,
      username: u.username,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      phone: u.phone,
      isActive: u.is_active,
      createdAt: u.created_at,
    });
  })
);

module.exports = router;
