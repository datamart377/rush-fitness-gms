// Round-trip validation for member emergency contact fields.
//
// Usage (from the backend/ folder, with your local DATABASE_URL):
//   node scripts/validate-emergency.js
//
// What it does:
//   1. Inserts a test member with both emergency_phone and emergency_phone_2 set
//   2. Re-reads the row by id
//   3. Asserts both fields persisted exactly as written
//   4. Also exercises the snake/camel conversion that the API layer uses
//   5. Cleans up by deleting the test member
//
// On success: prints "PASS" and exits 0.
// On any mismatch: prints what was expected vs got and exits 1.
//
// Read-only against existing data — only touches one test row it creates itself.

const { Pool } = require('pg');
const path = require('path');
// Load .env from the backend root regardless of where the script is invoked from.
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// Mirror the connection logic from src/db/pool.js so this script works against
// the same DB the running backend uses — DATABASE_URL if set, else DB_* parts.
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

const EXPECT_PRIMARY  = '0701111222';
const EXPECT_FALLBACK = '0774644922';
const TEST_PHONE      = '0700000099';   // unique enough to avoid collisions

let testId = null;
let allPassed = true;

const check = (label, expected, got) => {
  const ok = expected === got;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  if (!ok) allPassed = false;
};

(async () => {
  try {
    console.log('1) snake/camel key conversion');
    check('toSnakeKey(emergencyPhone)',  'emergency_phone',   toSnakeKey('emergencyPhone'));
    check('toSnakeKey(emergencyPhone2)', 'emergency_phone_2', toSnakeKey('emergencyPhone2'));
    check('toCamelKey(emergency_phone)',  'emergencyPhone',   toCamelKey('emergency_phone'));
    check('toCamelKey(emergency_phone_2)', 'emergencyPhone2', toCamelKey('emergency_phone_2'));

    console.log('\n2) insert test member with both emergency contacts');
    const ins = await pool.query(
      `INSERT INTO members (first_name, last_name, phone, emergency_phone, emergency_phone_2)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, emergency_phone, emergency_phone_2`,
      ['ValidationTest', 'EmergencyFields', TEST_PHONE, EXPECT_PRIMARY, EXPECT_FALLBACK]
    );
    testId = ins.rows[0].id;
    console.log('  inserted id:', testId);
    check('emergency_phone (RETURNING)',   EXPECT_PRIMARY,  ins.rows[0].emergency_phone);
    check('emergency_phone_2 (RETURNING)', EXPECT_FALLBACK, ins.rows[0].emergency_phone_2);

    console.log('\n3) re-read with the same SELECT shape the API uses');
    const sel = await pool.query(
      `SELECT id, member_code, first_name, last_name, phone, email, gender, dob,
              national_id, passport_number, emergency_name, emergency_phone,
              emergency_phone_2, photo_url, notes, is_active, joined_on,
              created_at, updated_at
         FROM members WHERE id = $1`,
      [testId]
    );
    check('row exists', 1, sel.rowCount);
    check('emergency_phone (SELECT)',   EXPECT_PRIMARY,  sel.rows[0].emergency_phone);
    check('emergency_phone_2 (SELECT)', EXPECT_FALLBACK, sel.rows[0].emergency_phone_2);

    console.log('\n4) simulate API camelize() pass and adaptMember() mapping');
    const camelized = {};
    for (const [k, v] of Object.entries(sel.rows[0])) camelized[toCamelKey(k)] = v;
    check('camelized.emergencyPhone',  EXPECT_PRIMARY,  camelized.emergencyPhone);
    check('camelized.emergencyPhone2', EXPECT_FALLBACK, camelized.emergencyPhone2);
    const adapted = { emergency: camelized.emergencyPhone || '', emergency2: camelized.emergencyPhone2 || '' };
    check('adapted.emergency',  EXPECT_PRIMARY,  adapted.emergency);
    check('adapted.emergency2', EXPECT_FALLBACK, adapted.emergency2);

    console.log('\n5) update only emergency_phone_2 (PATCH path) and re-read');
    const NEW_FALLBACK = '0712121212';
    await pool.query(
      `UPDATE members SET emergency_phone_2 = $1 WHERE id = $2`,
      [NEW_FALLBACK, testId]
    );
    const after = await pool.query(
      `SELECT emergency_phone, emergency_phone_2 FROM members WHERE id = $1`, [testId]
    );
    check('emergency_phone unchanged after partial update',   EXPECT_PRIMARY, after.rows[0].emergency_phone);
    check('emergency_phone_2 updated after partial update',   NEW_FALLBACK,  after.rows[0].emergency_phone_2);

    console.log('\n----------------------------------------');
    console.log(allPassed ? 'PASS — emergency contact round-trip works.' : 'FAIL — see ✗ lines above.');
  } catch (err) {
    console.error('ERROR:', err.message);
    allPassed = false;
  } finally {
    if (testId) {
      try {
        await pool.query('DELETE FROM members WHERE id = $1', [testId]);
        console.log('cleanup: deleted test member', testId);
      } catch (e) {
        console.error('cleanup failed:', e.message);
      }
    }
    await pool.end();
    process.exit(allPassed ? 0 : 1);
  }
})();
