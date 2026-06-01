// Membership integrity check for a single member.
//
// Usage (from the backend/ folder):
//   DATABASE_URL='postgresql://...' node scripts/check-member.js "X Tripple"
//
// Prints:
//   • all member rows whose first_name + last_name match the search term
//   • every membership for those members (with plan, dates, status, paid/due)
//   • every payment tied to those members or memberships
//   • audit-log entries that reference any of the above ids
//   • a "duplicates / overlaps" report flagging memberships whose date ranges
//     overlap each other for the same member — the typical sign of a stale
//     row that wasn't archived after a renewal/adjustment
//
// Intended to be run on demand from a developer machine. Read-only — never
// mutates anything.

const { Pool } = require('pg');

const search = process.argv.slice(2).join(' ').trim();
if (!search) {
  console.error('Usage: node scripts/check-member.js "<member name>"');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL env var is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
});

const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || ''));
const fmtUGX = (n) => 'UGX ' + Number(n || 0).toLocaleString();

(async () => {
  try {
    // ── 1. Find candidate members ───────────────────────────────────────
    const m = await pool.query(
      `SELECT id, member_code, first_name, last_name, phone, email,
              is_active, joined_on, created_at, updated_at
         FROM members
        WHERE (first_name || ' ' || last_name) ILIKE $1
           OR phone ILIKE $1
           OR member_code ILIKE $1
        ORDER BY created_at`,
      [`%${search}%`]
    );

    console.log(`\n── Members matching "${search}" (${m.rowCount}) ──`);
    if (!m.rowCount) {
      console.log('(none)');
      await pool.end();
      return;
    }
    for (const r of m.rows) {
      console.log(
        `  ${r.first_name} ${r.last_name}  [${r.member_code || '—'}]  id=${r.id}` +
        `\n    phone=${r.phone}  email=${r.email || '—'}  active=${r.is_active}` +
        `\n    joined=${ymd(r.joined_on)}  created=${r.created_at.toISOString()}  updated=${r.updated_at.toISOString()}`
      );
    }
    const memberIds = m.rows.map((r) => r.id);

    // ── 2. Their memberships ────────────────────────────────────────────
    const ms = await pool.query(
      `SELECT ms.id, ms.member_id, ms.start_date, ms.end_date,
              ms.status, ms.frozen_days, ms.total_due, ms.total_paid,
              p.code AS plan_code, p.name AS plan_name,
              ms.created_at, ms.updated_at, ms.created_by
         FROM memberships ms
         JOIN plans p ON p.id = ms.plan_id
        WHERE ms.member_id = ANY($1::uuid[])
        ORDER BY ms.created_at DESC`,
      [memberIds]
    );

    console.log(`\n── Memberships (${ms.rowCount}) ──`);
    for (const r of ms.rows) {
      const balance = Number(r.total_due) - Number(r.total_paid);
      console.log(
        `  ${ymd(r.start_date)} → ${ymd(r.end_date)}  ${r.plan_name}  [${r.status}]` +
        `  paid ${fmtUGX(r.total_paid)} / ${fmtUGX(r.total_due)}` +
        (balance > 0 ? `  bal ${fmtUGX(balance)}` : '') +
        `\n    membership_id=${r.id}  member_id=${r.member_id}` +
        `\n    created=${r.created_at.toISOString()}  updated=${r.updated_at.toISOString()}`
      );
    }

    // ── 3. Payments ─────────────────────────────────────────────────────
    const pay = await pool.query(
      `SELECT id, member_id, membership_id, amount, method, type, status,
              reference, notes, created_at
         FROM payments
        WHERE member_id     = ANY($1::uuid[])
           OR membership_id = ANY($2::uuid[])
        ORDER BY created_at DESC`,
      [memberIds, ms.rows.map((r) => r.id)]
    );

    console.log(`\n── Payments (${pay.rowCount}) ──`);
    for (const r of pay.rows) {
      console.log(
        `  ${r.created_at.toISOString()}  ${fmtUGX(r.amount)}  ${r.method}/${r.type}  [${r.status}]` +
        `\n    payment_id=${r.id}  membership_id=${r.membership_id || '—'}` +
        (r.reference ? `\n    ref=${r.reference}` : '') +
        (r.notes ? `\n    notes=${r.notes}` : '')
      );
    }

    // ── 4. Audit trail for member + membership ids ──────────────────────
    const allIds = [...memberIds, ...ms.rows.map((r) => r.id), ...pay.rows.map((r) => r.id)];
    const audit = await pool.query(
      `SELECT id, action, entity_type, entity_id, username, metadata, created_at
         FROM audit_logs
        WHERE entity_id = ANY($1::text[])
        ORDER BY created_at DESC
        LIMIT 100`,
      [allIds]
    );

    console.log(`\n── Audit log (${audit.rowCount}, most recent first) ──`);
    for (const r of audit.rows) {
      console.log(
        `  ${r.created_at.toISOString()}  ${r.action}  ${r.entity_type}/${r.entity_id}` +
        `  by ${r.username || '—'}` +
        (r.metadata && Object.keys(r.metadata).length ? `  meta=${JSON.stringify(r.metadata)}` : '')
      );
    }

    // ── 5. Overlap / duplicate analysis ─────────────────────────────────
    console.log(`\n── Overlap analysis ──`);
    const byMember = {};
    for (const r of ms.rows) (byMember[r.member_id] ||= []).push(r);
    let overlaps = 0;
    for (const [memberId, list] of Object.entries(byMember)) {
      list.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (new Date(a.end_date) >= new Date(b.start_date)) {
            overlaps++;
            console.log(`  ⚠ OVERLAP for member ${memberId}:`);
            console.log(`    A: ${a.id}  ${a.plan_name}  ${ymd(a.start_date)} → ${ymd(a.end_date)}  status=${a.status}  created=${a.created_at.toISOString()}`);
            console.log(`    B: ${b.id}  ${b.plan_name}  ${ymd(b.start_date)} → ${ymd(b.end_date)}  status=${b.status}  created=${b.created_at.toISOString()}`);
          }
        }
      }
    }
    if (!overlaps) console.log('  (no overlaps — every membership has a clean date range)');

    await pool.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
