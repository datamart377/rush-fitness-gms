// DANGER: drops every table in the public schema. Used by `npm run db:reset`.
require('dotenv').config();
const { pool } = require('../src/db/pool');

(async () => {
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('✓ schema reset');
  } catch (err) {
    console.error('✗ reset failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
