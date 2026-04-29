// Idempotent seed.  Re-runnable: uses ON CONFLICT DO NOTHING / UPDATE.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');

async function main() {
  const ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

  // ── 1. Admin user ───────────────────────────────────────────────
  const adminUser     = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminPass     = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const adminFullName = process.env.SEED_ADMIN_NAME     || 'System Administrator';
  const adminHash     = await bcrypt.hash(adminPass, ROUNDS);

  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [adminUser, adminHash, adminFullName]
  );

  // Sample receptionist for convenience
  const recHash = await bcrypt.hash('Joy@12345', ROUNDS);
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ('joy', $1, 'Front Desk – Joy', 'receptionist')
     ON CONFLICT (username) DO NOTHING`,
    [recHash]
  );

  // ── 2. Plans  (mirrors the original PLANS object, prices in KES) ─
  // The user can edit or relabel these; codes are stable for app code.
  const plans = [
    ['gym_daily',     'Daily (Gym)',                 'gym',    500,    1,   null, null],
    ['gym_weekly',    'Weekly (Gym)',                'gym',    2500,   7,   null, null],
    ['gym_monthly',   'Monthly (Gym)',               'gym',    6000,   30,  null, null],
    ['gym_half',      'Half Year (Gym)',             'gym',    30000,  180, null, null],
    ['gym_annual',    'Annual (Gym)',                'gym',    55000,  365, null, null],
    ['combo_session', 'Per Session (Gym + Steam)',   'combo',  800,    1,   null, null],
    ['combo_monthly', 'Monthly (Gym + Steam)',       'combo',  8000,   30,  null, null],
    ['combo_3month',  '3 Months (Gym + Steam)',      'combo',  22000,  90,  null, null],
    ['combo_half',    'Half Year (Gym + Steam)',     'combo',  40000,  180, null, null],
    ['combo_annual',  'Annual (Gym + Steam)',        'combo',  75000,  365, null, null],
    ['prepaid',       'Pre-Paid Balance',            'prepaid',0,      365, null, 500],
    ['group_2',       'Group of 2 (Monthly)',        'group',  10000,  30,  2,    null],
    ['group_3',       'Group of 3 (Monthly)',        'group',  14000,  30,  3,    null],
    ['group_5',       'Group of 5 (Monthly)',        'group',  22000,  30,  5,    null],
  ];
  for (const p of plans) {
    await pool.query(
      `INSERT INTO plans (code, name, category, price, duration_days, group_size, daily_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE
         SET name=EXCLUDED.name, price=EXCLUDED.price, duration_days=EXCLUDED.duration_days`,
      p
    );
  }

  // ── 3. Activities / classes ─────────────────────────────────────
  const activities = [
    ['gym_daily_activity', 'Daily Gym Access', 500, 200],
    ['aerobics',           'Aerobics',          500, 200],
    ['spinning',           'Spinning',          600, 200],
    ['bantu_vibes',        'Bantu Vibes',       500, 200],
    ['kona',               'Kona Dance',        500, 200],
    ['fimbo',              'Fimbo Dance',       500, 200],
    ['boxing',             'Boxing',            500, 200],
    ['bootcamp',           'Bootcamp',          500, 200],
    ['abs',                'ABS Class',         500, 200],
    ['steam',              'Steam Bath',        500, 200],
    ['massage',            'Massage',           500, 200],
    ['ballet',             'Ballet Dance',      300, 300],
  ];
  for (const a of activities) {
    await pool.query(
      `INSERT INTO activities (code, name, standalone_price, addon_price)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      a
    );
  }

  // ── 4. Lockers — 30 gents + 20 ladies ───────────────────────────
  for (let i = 1; i <= 30; i++) {
    await pool.query(
      `INSERT INTO lockers (number, section) VALUES ($1, 'gents')
       ON CONFLICT (section, number) DO NOTHING`,
      [i]
    );
  }
  for (let i = 1; i <= 20; i++) {
    await pool.query(
      `INSERT INTO lockers (number, section) VALUES ($1, 'ladies')
       ON CONFLICT (section, number) DO NOTHING`,
      [i]
    );
  }

  // ── 5. Discounts ────────────────────────────────────────────────
  const discounts = [
    ['STAFF10',   'Staff discount 10%',          'percent', 10],
    ['STUDENT15', 'Student discount 15%',        'percent', 15],
    ['EARLYBIRD', 'Early-bird flat 1000 off',    'flat',    1000],
  ];
  for (const d of discounts) {
    await pool.query(
      `INSERT INTO discounts (code, description, type, value)
       VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`,
      d
    );
  }

  // ── 6. Sample products ─────────────────────────────────────────
  const products = [
    ['SUP-001', 'Whey Protein 1kg',     'supplements', 4500, 30],
    ['SUP-002', 'BCAA 30 servings',     'supplements', 2500, 20],
    ['BEV-001', 'Energy Drink',         'beverage',    150,  100],
    ['BEV-002', 'Bottled Water 500ml',  'beverage',    50,   200],
    ['ACC-001', 'Lifting Gloves (M)',   'accessories', 800,  15],
    ['ACC-002', 'Skipping Rope',        'accessories', 600,  10],
  ];
  for (const p of products) {
    await pool.query(
      `INSERT INTO products (sku, name, category, price, stock)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sku) DO NOTHING`,
      p
    );
  }

  // ── 7. Sample equipment ────────────────────────────────────────
  const equipment = [
    ['Treadmill #1',     'Cardio',   'TRD-001', 'operational'],
    ['Treadmill #2',     'Cardio',   'TRD-002', 'maintenance'],
    ['Spin Bike #1',     'Cardio',   'SPB-001', 'operational'],
    ['Squat Rack',       'Strength', 'SQR-001', 'operational'],
    ['Cable Crossover',  'Strength', 'CBL-001', 'operational'],
  ];
  for (const e of equipment) {
    await pool.query(
      `INSERT INTO equipment (name, category, serial_number, status)
       VALUES ($1,$2,$3,$4) ON CONFLICT (serial_number) DO NOTHING`,
      e
    );
  }

  // ── 8. Sample members + memberships ────────────────────────────
  const memberSeed = [
    ['Sarah',  'Nakamya', '0771234567', 'Female', '1995-03-15', 'gym_monthly'],
    ['James',  'Okello',  '0782345678', 'Male',   '1990-07-22', 'combo_monthly'],
    ['Grace',  'Auma',    '0753456789', 'Female', '1988-11-30', 'gym_weekly'],
    ['Peter',  'Mukasa',  '0764567890', 'Male',   '1992-05-18', 'gym_monthly'],
  ];
  for (const [first, last, phone, gender, dob, planCode] of memberSeed) {
    // Skip if a member with this phone already exists (keeps the seed idempotent).
    const existing = await pool.query('SELECT id FROM members WHERE phone = $1 LIMIT 1', [phone]);
    if (existing.rowCount) continue;

    const r = await pool.query(
      `INSERT INTO members (first_name, last_name, phone, gender, dob)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [first, last, phone, gender, dob]
    );
    const memberId = r.rows[0].id;

    const planR = await pool.query('SELECT id, price, duration_days FROM plans WHERE code = $1', [planCode]);
    const plan = planR.rows[0];
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + plan.duration_days);

    await pool.query(
      `INSERT INTO memberships (member_id, plan_id, start_date, end_date, total_due, total_paid, status)
       VALUES ($1,$2,$3,$4,$5,$5,'active')`,
      [memberId, plan.id, start.toISOString().split('T')[0], end.toISOString().split('T')[0], plan.price]
    );
  }

  console.log('✓ Seed complete');
  console.log('');
  console.log('  Admin login:   ', adminUser, '/', adminPass);
  console.log('  Reception:      joy / Joy@12345');
  console.log('');
  await pool.end();
}

main().catch(async (err) => {
  console.error('✗ seed failed:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
