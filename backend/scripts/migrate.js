// Simple, dependency-free migration runner.
// Reads .sql files from ../migrations in alphabetical order and applies any
// that haven't been recorded in the schema_migrations table yet.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

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
