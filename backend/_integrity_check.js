const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // 1) Find every member matching "X Tripple"
    const m = await pool.query(`
      SELECT id, member_code, first_name, last_name, phone, email, is_active, created_at, updated_at
        FROM members
       WHERE (first_name || ' ' || last_name) ILIKE '%tripple%'
          OR first_name ILIKE 'x%'
       ORDER BY created_at
    `);
    console.log(`\n=== Members matching X Tripple (${m.rowCount}) ===`);
    m.rows.forEach(r => console.log(JSON.stringify(r)));

    if (!m.rowCount) { await pool.end(); return; }
    const ids = m.rows.map(r => r.id);

    // 2) Their memberships
    const ms = await pool.query(`
      SELECT ms.id, ms.member_id, p.code AS plan, ms.start_date, ms.end_date,
             ms.is_active, ms.status, ms.total_due, ms.frozen_days,
             ms.created_at, ms.updated_at
        FROM memberships ms
        JOIN plans p ON p.id = ms.plan_id
       WHERE ms.member_id = ANY($1::uuid[])
       ORDER BY ms.created_at DESC
    `, [ids]);
    console.log(`\n=== Memberships (${ms.rowCount}) ===`);
    ms.rows.forEach(r => console.log(JSON.stringify(r)));

    // 3) Payments tied to those memberships or members
    const pay = await pool.query(`
      SELECT id, member_id, membership_id, amount, currency, method, type, status,
             notes, created_at
        FROM payments
       WHERE member_id = ANY($1::uuid[])
          OR membership_id IN (SELECT id FROM memberships WHERE member_id = ANY($1::uuid[]))
       ORDER BY created_at DESC
    `, [ids]);
    console.log(`\n=== Payments (${pay.rowCount}) ===`);
    pay.rows.forEach(r => console.log(JSON.stringify(r)));

    // 4) Audit log entries for those memberships
    const audit = await pool.query(`
      SELECT id, action, entity_type, entity_id, user_id, meta, created_at
        FROM audit_logs
       WHERE entity_id = ANY($1::uuid[])
          OR entity_id = ANY($2::uuid[])
       ORDER BY created_at DESC
       LIMIT 50
    `, [ids, ms.rows.map(r => r.id)]);
    console.log(`\n=== Audit logs (${audit.rowCount}) ===`);
    audit.rows.forEach(r => console.log(JSON.stringify(r)));

    // 5) Overlap check
    console.log(`\n=== Overlap analysis ===`);
    const byMember = {};
    ms.rows.forEach(r => { (byMember[r.member_id] ||= []).push(r); });
    for (const [memberId, list] of Object.entries(byMember)) {
      list.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));
      for (let i = 0; i < list.length; i++) {
        for (let j = i+1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (new Date(a.end_date) >= new Date(b.start_date)) {
            console.log(`OVERLAP for member ${memberId}:`);
            console.log(`  A: ${a.id} ${a.plan} ${a.start_date.toISOString().slice(0,10)} → ${a.end_date.toISOString().slice(0,10)} active=${a.is_active}`);
            console.log(`  B: ${b.id} ${b.plan} ${b.start_date.toISOString().slice(0,10)} → ${b.end_date.toISOString().slice(0,10)} active=${b.is_active}`);
          }
        }
      }
    }

    await pool.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
