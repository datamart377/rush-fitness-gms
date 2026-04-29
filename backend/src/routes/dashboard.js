// Aggregated stats for the dashboard widgets in the React app.
const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    // Let Postgres compute "today" so it respects the database's timezone.
    const [members, todayCheckIns, todayWalkIns, todayRevenue, activeMemberships, expiringSoon, lockerStats, equipMaint, todayDate] = await Promise.all([
      pool.query(`SELECT
                    COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
                    COUNT(*)::int AS total
                   FROM members`),
      pool.query(`SELECT COUNT(*)::int AS n FROM attendance WHERE visit_date = CURRENT_DATE`),
      pool.query(`SELECT COUNT(*)::int AS n FROM walk_ins WHERE visit_date = CURRENT_DATE`),
      pool.query(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM payments WHERE paid_at::date = CURRENT_DATE AND status = 'completed'`),
      pool.query(`SELECT COUNT(*)::int AS n FROM memberships WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*)::int AS n FROM memberships WHERE status = 'active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`),
      pool.query(`SELECT
                    COUNT(*) FILTER (WHERE status = 'available')::int  AS available,
                    COUNT(*) FILTER (WHERE status = 'occupied')::int   AS occupied,
                    COUNT(*) FILTER (WHERE status = 'maintenance')::int AS maintenance
                   FROM lockers`),
      pool.query(`SELECT COUNT(*)::int AS n FROM equipment WHERE status = 'maintenance'`),
      pool.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d`),
    ]);

    res.json({
      members: { active: members.rows[0].active, total: members.rows[0].total },
      today: {
        date: todayDate.rows[0].d,
        checkIns: todayCheckIns.rows[0].n,
        walkIns: todayWalkIns.rows[0].n,
        revenue: Number(todayRevenue.rows[0].total),
      },
      memberships: {
        active: activeMemberships.rows[0].n,
        expiringIn7Days: expiringSoon.rows[0].n,
      },
      lockers: lockerStats.rows[0],
      equipment: { underMaintenance: equipMaint.rows[0].n },
    });
  })
);

module.exports = router;
