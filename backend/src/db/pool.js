// Postgres connection pool. Use ONE pool process-wide.
// Reads either DATABASE_URL or the DB_* parts from .env.
const { Pool } = require('pg');
require('dotenv').config();

const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'rush_fitness_gms',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };

// Enable SSL for managed Postgres providers (Render, Heroku, Supabase, etc.)
// when connecting via a remote URL. Local dev (no DATABASE_URL) skips it.
// PGSSL=disable lets you opt out for unusual setups.
const wantSsl =
  process.env.PGSSL !== 'disable' &&
  (process.env.PGSSL === 'require' ||
   process.env.NODE_ENV === 'production' ||
   /[?&]sslmode=require/i.test(process.env.DATABASE_URL || '') ||
   (!!process.env.DATABASE_URL && !/(localhost|127\.0\.0\.1)/i.test(process.env.DATABASE_URL || '')));

const pool = new Pool({
  ...config,
  ...(wantSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Cap individual query/statement time so a stuck query can't hang the whole app.
  query_timeout: 10_000,
  statement_timeout: 10_000,
});

pool.on('error', (err) => {
  // Log but don't crash on idle client errors
  console.error('[pg] idle client error:', err.message);
});

// Thin wrapper that logs slow queries in dev.
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - start;
  if (process.env.NODE_ENV !== 'production' && ms > 200) {
    console.warn(`[pg] slow query ${ms}ms:`, text.split('\n')[0].slice(0, 120));
  }
  return res;
}

// For multi-statement transactions.
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTx };
