// Simple, dependency-free migration runner.
// Reads .sql files from ../migrations in alphabetical order and applies any
// that haven't been recorded in the schema_migrations table yet.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

// ── Wait for Postgres to be ready to accept sessions ──
// Handles transient "cannot_connect_now" states that happen during
// Render blueprint syncs, plan changes, and maintenance windows.
// SQLSTATE 57P03 = the daemon accepted the TCP handshake but is
// still starting up / shutting down / recovering; ECONNREFUSED /
// ETIMEDOUT / ENOTFOUND cover TCP + DNS hiccups during the same
// class of restart. Retry with a fixed 2s backoff up to 30 tries
// (60s total) — comfortably longer than Render's typical restart
// window and short enough that a truly-dead DB fails the deploy
// promptly instead of hanging.
async function waitForDb({ maxTries = 30, delayMs = 2000 } = {}) {
  for (let i = 1; i <= maxTries; i++) {
    try {
      await pool.query('SELECT 1');
      if (i > 1) console.log(`[migrate] DB ready after ${i} tries.`);
      return;
    } catch (err) {
      const code = err.code;
      const transient =
        code === '57P03' ||           // cannot_connect_now
        code === 'ECONNREFUSED' ||    // TCP refused
        code === 'ETIMEDOUT' ||       // network hiccup
        code === 'ENOTFOUND';         // DNS not resolving yet
      if (!transient || i === maxTries) throw err;
      console.log(`[migrate] DB not ready (${code}), retry ${i}/${maxTries} in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function ensureMetaTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applied() {
  const r = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(r.rows.map((row) => row.filename));
}

async function main() {
  await waitForDb();
  await ensureMetaTable();
  const done = await applied();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (done.has(file)) {
      console.log(`· skip   ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✓ apply  ${file}`);
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ failed ${file}: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(ran === 0 ? 'No migrations to run.' : `Applied ${ran} migration(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
