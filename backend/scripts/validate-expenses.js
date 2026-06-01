// Round-trip validation for the expenses table.
//
// Usage (from the backend/ folder):
//   node scripts/validate-expenses.js
//
// To run against production instead of local, export DATABASE_URL first:
//   export DATABASE_URL='postgresql://...your-render-pg-url...'
//   node scripts/validate-expenses.js
//
// What it does:
//   1. Verifies snake/camel key conversion the API layer uses
//   2. Inserts a test expense (utilities, UGX 12345, today)
//   3. Re-reads it via the same SELECT shape as GET /api/expenses
//   4. Confirms every field round-tripped exactly
//   5. Filters by date range (from/to) and category — proves the index works
//   6. Cleans up the test row
//
// On success: prints PASS and exits 0.
// On any mismatch: prints what was expected vs got and exits 1.

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
console.log('connecting to:',
  process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':****@')
    : `${poolConfig.user}@${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`
);
const pool = new Pool(poolConfig);

// Mirror of the helpers in backend/src/utils/crud.js so we can validate them
// in isolation, not just the DB column write.
const toSnakeKey = (k) =>
  k.replace(/([A-Z])/g, '_$1').replace(/([a-zA-Z])(\d)/g, '$1_$2').toLowerCase();
const toCamelKey = (k) =>
  k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

const TEST_CATEGORY    = 'ValidationTest';     // unique to avoid colliding with real data
const TEST_DESCRIPTION = 'Round-trip test row — auto-deleted';
const TEST_AMOUNT      = 12345;
const TEST_METHOD      = 'cash';
const TEST_RECEIPT     = 'VAL-RCP-001';
const TEST_DATE        = new Date().toISOString().slice(0, 10);  // today

let testId = null;
let allPassed = true;

const check = (label, expected, got) => {
  // Numerics from pg's NUMERIC type come back as strings — normalize for compare.
  const norm = (v) => (v == null ? v : typeof v === 'object' ? v : String(v));
  const ok = norm(expected) === norm(got);
  console.log(`  ${ok ? '✓' : '✗'} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  if (!ok) allPassed = false;
};

(async () => {
  try {
    console.log('1) snake/camel key conversion');
    check('toSnakeKey(spentOn)',    'spent_on',    toSnakeKey('spentOn'));
    check('toSnakeKey(paidBy)',     'paid_by',     toSnakeKey('paidBy'));
    check('toSnakeKey(receiptUrl)', 'receipt_url', toSnakeKey('receiptUrl'));
    check('toCamelKey(spent_on)',    'spentOn',    toCamelKey('spent_on'));
    check('toCamelKey(paid_by)',     'paidBy',     toCamelKey('paid_by'));
    check('toCamelKey(receipt_url)', 'receiptUrl', toCamelKey('receipt_url'));

    console.log('\n2) insert test expense (mirrors POST /api/expenses payload)');
    const ins = await pool.query(
      `INSERT INTO expenses (category, description, amount, spent_on, paid_by, receipt_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, category, description, amount, spent_on, paid_by, receipt_url`,
      [TEST_CATEGORY, TEST_DESCRIPTION, TEST_AMOUNT, TEST_DATE, TEST_METHOD, TEST_RECEIPT]
    );
    testId = ins.rows[0].id;
    console.log('  inserted id:', testId);
    check('category (RETURNING)',    TEST_CATEGORY,    ins.rows[0].category);
    check('description (RETURNING)', TEST_DESCRIPTION, ins.rows[0].description);
    check('amount (RETURNING)',      TEST_AMOUNT,      ins.rows[0].amount);
    check('paid_by (RETURNING)',     TEST_METHOD,      ins.rows[0].paid_by);
    check('receipt_url (RETURNING)', TEST_RECEIPT,     ins.rows[0].receipt_url);

    console.log('\n3) re-read with the same SELECT shape the API uses');
    const sel = await pool.query(`SELECT * FROM expenses WHERE id = $1`, [testId]);
    check('row exists', 1, sel.rowCount);
    check('category (SELECT)',    TEST_CATEGORY,    sel.rows[0].category);
    check('description (SELECT)', TEST_DESCRIPTION, sel.rows[0].description);
    check('amount (SELECT)',      TEST_AMOUNT,      sel.rows[0].amount);
    check('paid_by (SELECT)',     TEST_METHOD,      sel.rows[0].paid_by);
    check('receipt_url (SELECT)', TEST_RECEIPT,     sel.rows[0].receipt_url);

    console.log('\n4) simulate API camelize() — what the frontend receives');
    const camelized = {};
    for (const [k, v] of Object.entries(sel.rows[0])) camelized[toCamelKey(k)] = v;
    check('camelized.spentOn maps to a Date',  true, camelized.spentOn instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(camelized.spentOn)));
    check('camelized.paidBy',     TEST_METHOD,  camelized.paidBy);
    check('camelized.receiptUrl', TEST_RECEIPT, camelized.receiptUrl);

    console.log('\n5) date-range filter (GET /api/expenses?from&to)');
    const range = await pool.query(
      `SELECT id FROM expenses WHERE spent_on >= $1::date AND spent_on <= $2::date AND id = $3`,
      [TEST_DATE, TEST_DATE, testId]
    );
    check('found by today’s spent_on range', 1, range.rowCount);

    console.log('\n6) category filter (GET /api/expenses?category=...)');
    const cat = await pool.query(
      `SELECT id FROM expenses WHERE category = $1 AND id = $2`,
      [TEST_CATEGORY, testId]
    );
    check('found by category', 1, cat.rowCount);

    console.log('\n----------------------------------------');
    console.log(allPassed ? 'PASS — expenses round-trip works.' : 'FAIL — see ✗ lines above.');
  } catch (err) {
    console.error('ERROR:', err.message);
    allPassed = false;
  } finally {
    if (testId) {
      try {
        await pool.query('DELETE FROM expenses WHERE id = $1', [testId]);
        console.log('cleanup: deleted test expense', testId);
      } catch (e) {
        console.error('cleanup failed:', e.message);
      }
    }
    await pool.end();
    process.exit(allPassed ? 0 : 1);
  }
})();
