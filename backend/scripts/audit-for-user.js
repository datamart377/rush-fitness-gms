// Pull audit-log entries for one staff user over a date range.
//
// Usage (from the backend/ folder):
//   node scripts/audit-for-user.js <username> [from] [to]
//
// Examples:
//   node scripts/audit-for-user.js martha yesterday
//   node scripts/audit-for-user.js martha 2026-05-13
//   node scripts/audit-for-user.js martha 2026-05-01 2026-05-13
//
// Defaults: if no dates are given, prints the last 24 hours.
// Date words supported: "today", "yesterday".
//
// Read-only — touches no rows other than the lookup SELECTs.

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME     || 'rush_fitness_gms',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };
if (process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) {
  poolConfig.ssl = { rejectUnauthorized: false };
}
const pool = new Pool(poolConfig);

const ymd = (d) => d.toISOString().slice(0, 10);
const startOfDayLocal = (s) => new Date(`${s}T00:00:00`);
const endOfDayLocal   = (s) => new Date(`${s}T23:59:59.999`);

function parseDateArg(arg, fallback) {
  if (!arg) return fallback;
  const now = new Date();
  if (arg === 'today')     return ymd(now);
  if (arg === 'yesterday') return ymd(new Date(now.getTime() - 86400000));
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  console.error(`Bad date "${arg}". Use yyyy-mm-dd, "today", or "yesterday".`);
  process.exit(2);
}

(async () => {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node scripts/audit-for-user.js <username> [from] [to]');
    process.exit(2);
  }
  // Default = yesterday → yesterday (i.e. last full day).
  const yest = ymd(new Date(Date.now() - 86400000));
  const fromArg = parseDateArg(process.argv[3], yest);
  const toArg   = parseDateArg(process.argv[4], fromArg);

  try {
    // Look up the user (so we can show their name + filter by user_id, which
    // is more reliable than matching the snapshot `username` text column).
    const u = await pool.query(
      `SELECT id, username, full_name, role FROM users WHERE username = $1`,
      [username]
    );
    if (!u.rowCount) {
      console.error(`No user with username "${username}".`);
      console.error('Tip: try one of:');
      const all = await pool.query(`SELECT username, full_name FROM users ORDER BY username`);
      all.rows.forEach((r) => console.error(`  • ${r.username}  (${r.full_name || ''})`));
      process.exit(1);
    }
    const me = u.rows[0];

    const fromTs = startOfDayLocal(fromArg).toISOString();
    const toTs   = endOfDayLocal(toArg).toISOString();

    const r = await pool.query(
      `SELECT id, created_at, action, entity_type, entity_id, ip_address, metadata
         FROM audit_logs
        WHERE user_id = $1
          AND created_at >= $2::timestamptz
          AND created_at <= $3::timestamptz
        ORDER BY created_at ASC`,
      [me.id, fromTs, toTs]
    );

    console.log(`\n=== Audit log for ${me.full_name || me.username} (${me.username}, ${me.role}) ===`);
    console.log(`Window: ${fromArg} → ${toArg}   (${r.rowCount} row${r.rowCount === 1 ? '' : 's'})\n`);

    if (!r.rowCount) {
      console.log('No activity recorded in this window.');
    } else {
      r.rows.forEach((row) => {
        const t = new Date(row.created_at).toLocaleString('en-UG', { hour12: false });
        const meta = row.metadata ? ` ${JSON.stringify(row.metadata)}` : '';
        const target = row.entity_type ? `${row.entity_type}#${(row.entity_id || '').slice(0, 8)}` : '';
        console.log(`${t}  ${row.action.padEnd(24)} ${target}${meta}`);
      });
    }

    // Quick action breakdown so you can scan totals at a glance.
    if (r.rowCount) {
      const byAction = {};
      r.rows.forEach((row) => { byAction[row.action] = (byAction[row.action] || 0) + 1; });
      console.log('\n--- Totals by action ---');
      Object.entries(byAction).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
        console.log(`  ${k.padEnd(24)} ${v}`);
      });
    }
    console.log('');
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
