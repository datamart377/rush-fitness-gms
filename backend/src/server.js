// Rush Fitness GMS — Express API entry point.
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { pool } = require('./db/pool');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Route modules
const authRoutes        = require('./routes/auth');
const usersRoutes       = require('./routes/users');
const membersRoutes     = require('./routes/members');
const trainersRoutes    = require('./routes/trainers');
const plansRoutes       = require('./routes/plans');
const membershipsRoutes = require('./routes/memberships');
const paymentsRoutes    = require('./routes/payments');
const lockersRoutes     = require('./routes/lockers');
const productsRoutes    = require('./routes/products');
const activitiesRoutes  = require('./routes/activities');
const timetableRoutes   = require('./routes/timetable');
const attendanceRoutes  = require('./routes/attendance');
const walkInsRoutes     = require('./routes/walkIns');
const equipmentRoutes   = require('./routes/equipment');
const discountsRoutes   = require('./routes/discounts');
const expensesRoutes    = require('./routes/expenses');
const auditRoutes       = require('./routes/audit');
const dashboardRoutes   = require('./routes/dashboard');

const app = express();

// Trust proxy (so req.ip is correct behind nginx/proxy if you ever deploy).
app.set('trust proxy', 1);

// ── DEBUG: log every incoming request the moment it arrives, before any other
//    middleware runs. This makes it obvious if a request is reaching Node at
//    all, and which middleware (if any) is swallowing it.
app.use((req, _res, next) => {
  console.log(`[req] ${new Date().toISOString()} ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// ── Middleware ────────────────────────────────────────────────────
// Helmet's defaults set Cross-Origin-Resource-Policy: same-origin and a strict
// COOP, which blocks the React app (a different origin in dev) from reading
// API responses. Disable just those — keep all other security headers on.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,  // CSP isn't useful on a JSON API anyway
}));

// CORS — in dev, allow any localhost/127.0.0.1 origin so the React app works
// regardless of which port CRA picked (3003, 3009, etc). In prod, fall back
// to the explicit comma-separated CORS_ORIGIN list.
const explicitOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3003')
  .split(',').map((s) => s.trim()).filter(Boolean);
const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                       // curl, server-to-server
    if (explicitOrigins.includes(origin)) return cb(null, true);
    if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`CORS: origin not allowed: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'down', error: err.message });
  }
});

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/users',        usersRoutes);
app.use('/api/members',      membersRoutes);
app.use('/api/trainers',     trainersRoutes);
app.use('/api/plans',        plansRoutes);
app.use('/api/memberships',  membershipsRoutes);
app.use('/api/payments',     paymentsRoutes);
app.use('/api/lockers',      lockersRoutes);
app.use('/api/products',     productsRoutes);
app.use('/api/activities',   activitiesRoutes);
app.use('/api/timetable',    timetableRoutes);
app.use('/api/attendance',   attendanceRoutes);
app.use('/api/walk-ins',     walkInsRoutes);
app.use('/api/equipment',    equipmentRoutes);
app.use('/api/discounts',    discountsRoutes);
app.use('/api/expenses',     expensesRoutes);
app.use('/api/audit-logs',   auditRoutes);
app.use('/api/dashboard',    dashboardRoutes);

// ── Error handlers (must be last) ─────────────────────────────────
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 4000);
// Don't pass a host arg — Node listens on dual-stack IPv6+IPv4 by default,
// which matters because Chrome resolves `localhost` to ::1 on some setups.
const server = app.listen(PORT, () => {
  console.log(`🏋️  Rush Fitness API listening on http://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/api/health`);
  console.log(`   Env:       ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown so the pool drains.
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down…`);
  server.close(async () => {
    try { await pool.end(); } catch {}
    process.exit(0);
  });
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
