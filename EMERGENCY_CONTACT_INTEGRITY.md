# Emergency Contact — Integrity Report

_Date: 2026-05-30 · Scope: members + walk-ins; field handling end-to-end through `src/App.jsx`, `backend/src/routes/members.js`, `backend/src/routes/walkIns.js`, `backend/src/utils/crud.js`, and `backend/migrations/001_initial_schema.sql`._

No code was modified during this audit.

---

## TL;DR

The two complaints have **different root causes** even though they look the same on the UI:

| Entity | What the user sees | Actual root cause |
|---|---|---|
| **Walk-In** | Emergency 1 and Emergency 2 always blank in Edit Walk-In | **Backend has no column to store them.** The walk-ins table doesn't have `emergency_phone` / `emergency_phone_2`, the route's `FIELDS` whitelist doesn't include them, and the create/update calls never send them. Values typed into the Walk-In Add form are silently dropped. The Edit modal also only shows one emergency input. |
| **Member** | Emergency 1/2 sometimes blank in Edit Member | The full member path (schema, backend, adapter, form, save) is correct end-to-end. The most likely explanation is **historical data created before the field existed in the form/adapter**, plus a minor `\|\| undefined` bug that means existing values cannot be **cleared** through PATCH (only overwritten with a non-empty value). |

---

## Severity summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 2 |
| Medium | 2 |
| Low / Observation | 4 |
| Confirmed working | 5 |

---

## Critical

### C1. Walk-in emergency contact is never persisted anywhere

**Where the data dies (three places, in order):**

1. **Schema — no column exists.**
   `backend/migrations/001_initial_schema.sql:279–294`
   ```sql
   CREATE TABLE walk_ins (
     id, full_name, phone, visit_date, activity_id, amount,
     payment_status, checked_in, checked_in_at, recorded_by, notes,
     created_at, updated_at
   );
   ```
   No `emergency_phone`, no `emergency_phone_2`, no `emergency_name`, no `gender`.

2. **Backend whitelist — `FIELDS` strips them.**
   `backend/src/routes/walkIns.js:14–17`
   ```js
   const FIELDS = [
     'full_name','first_name','last_name','phone','visit_date','activity_id','amount',
     'payment_status','checked_in','checked_in_at','recorded_by','notes',
   ];
   ```
   Because `backend/src/utils/crud.js:pickFields` only persists keys whose snake-case name is in `FIELDS`, anything the frontend sends as `emergencyPhone` / `emergencyPhone2` is silently dropped before SQL is built.

3. **Frontend never sends them anyway.**
   `src/App.jsx:5378–5389` (Walk-In Add submit) and `5415–5423` (Walk-In Update submit) read `form.phone`, `form.amount`, etc., but **omit `emergency`, `emergency2`, and `gender`** from the API body entirely:
   ```js
   await walkInsApi.create({
     firstName, lastName, fullName, phone, visitDate, amount,
     paymentStatus, notes,
   });
   ```
   The Add modal collects `emergency` and `emergency2` in state (`src/App.jsx:5345`) and shows the inputs (`5524–5525`), but the submit handler drops both before the network call.

**Net effect:** A receptionist types an emergency contact while creating a walk-in. The modal closes successfully. The value is in React state for a few hundred milliseconds, then `reload()` overwrites the row with the backend response — which has no emergency field. On next open of Edit Walk-In, the field reads as empty.

**Why this is critical and not High:** for a walk-in (a non-member at the gym for one session), the emergency contact is the **only** safety record on file. There is no profile to fall back on. Losing it for every walk-in is a real-world safety gap, not just a data-hygiene one.

---

## High

### H1. Edit Walk-In modal only has ONE emergency field; the other is unreachable

**Where:** `src/App.jsx:2890–2903`

```jsx
{isAdmin && <>
  <div className="form-group"><label>Surname</label>…</div>
  <div className="form-group"><label>Other Name(s)</label>…</div>
  <div className="form-group"><label>Phone</label>…</div>
  <div className="form-group"><label>Emergency Contact</label>
    <input value={editWalkin.emergency || ""} … /></div>
  <div className="form-group"><label>Gender</label>…</div>
  <div className="form-group"><label>Visit Date</label>…</div>
</>}
```

Compare with the **Add Walk-In** modal at `src/App.jsx:5524–5525`, which has both Emergency Contact 1 and 2. The Edit Walk-In modal is the only place to fix a typed-wrong emergency number, and it can only edit the first one. The discrepancy with the Add form will confuse staff into thinking the second contact "disappeared on edit", even before they realise it never persisted in the first place (see C1).

Once C1 is fixed, this becomes the gating issue for editability parity.

### H2. `adaptWalkIn` doesn't surface any emergency or gender field

**Where:** `src/App.jsx:150–177`

```js
return {
  ...w,
  firstName, lastName, name, visitDate, paymentStatus, checkedIn,
  amount, amountDue, amountPaid,
};
```

There is no `emergency: w.emergencyPhone || ""` line equivalent to `adaptMember`. So even if you added the columns + whitelist tomorrow, the existing Edit Walk-In modal would still show empty inputs until the adapter is updated to map them in. Mentioning this here so the fix isn't applied half-way.

---

## Medium

### M1. `memberFormToApi` drops cleared emergency fields with `|| undefined`

**Where:** `src/App.jsx:3430–3431`

```js
emergencyPhone:  f.emergency  || undefined,
emergencyPhone2: f.emergency2 || undefined,
```

`undefined` keys are stripped by `JSON.stringify`, so they never reach the backend. For an **update**, that means: a staff member who clears an emergency number and clicks Save will see the old value reappear after reload, because the backend treated the field as "not provided" and left the existing row untouched.

To allow a staff to clear it, the body needs to send an empty string explicitly, e.g.

```js
emergencyPhone:  f.emergency  ?? "",
emergencyPhone2: f.emergency2 ?? "",
```

Combined with the `pickFields` helper at `backend/src/utils/crud.js:36` (`v === '' ? null : v`), the backend would then correctly write `NULL`.

This is the most plausible source of the user's "I saved an emergency contact and it disappeared" report **for members**: if a previous edit pass ever had `f.emergency` undefined (e.g. an older form layout that didn't render the field, or an admin who patched an unrelated field while the form mistakenly left `emergency` empty), the PATCH would still no-op — but if it had a real value loaded from the DB and the form blanked it programmatically before submit, the bug above would mean the blank wins on the next round-trip.

### M2. Member `emergency_name` column exists but is never collected by the UI

**Where:** schema `backend/migrations/001_initial_schema.sql:53–55`; backend `FIELDS` at `members.js:17–21`; frontend form state at `App.jsx:3447`.

The schema and backend both support `emergency_name` (the name of the contact, separate from the phone numbers), but the frontend has no `emergencyName` field in `memberFormToApi` or in the Add/Edit modals. Whatever values were ever in that column will never be displayed to staff and cannot be created or updated through the UI.

---

## Low / Observation

### L1. `gender` is silently dropped on walk-in create/update too

The Add Walk-In modal collects gender (`src/App.jsx:5524` neighbourhood) and the Edit Walk-In modal shows a gender select (`App.jsx:2897–2900`), but the backend walk-in route doesn't whitelist `gender`, and the table has no `gender` column. Same family of bug as C1, just at lower severity since gender isn't a safety field.

The new expired-member quick check-in path also passes `gender` (`App.jsx:2400`) which gets dropped server-side.

### L2. Backend POST `/walk-ins` validator doesn't even declare `emergencyPhone`

`backend/src/routes/walkIns.js:46–57` validates `fullName`, `firstName`, `lastName`, `amount`, `phone`, `paymentStatus`, `checkedIn`. Adding emergency columns later will need both the schema migration AND a validator update or the field will be allowed-but-not-validated (i.e. anyone can stuff arbitrarily long strings into it).

### L3. Trainer Edit form uses the same pattern as Member (Emergency 1 + 2)

`src/App.jsx:6301–6302` and `6187`. The trainer adapter and form treat both fields consistently. Not a bug — just confirming the inconsistency is concentrated in **walk-ins**, not "the codebase".

### L4. No automated coverage for emergency-contact round-tripping

Same observation as L6 in `MEMBERSHIP_PAYMENT_VALIDATION.md`. A single supertest case per entity ("create with emergency 1+2, refetch, expect them back") would catch C1, H1, H2, M1, M2 in CI.

---

## Confirmed working

| # | Behaviour | Reference |
|---|---|---|
| W1 | `members` table has `emergency_phone`, `emergency_phone_2`, `emergency_name` columns | `001_initial_schema.sql:53–55` |
| W2 | `members.js` whitelists all three emergency columns | `members.js:17–21` |
| W3 | `GET /members` explicitly selects all three back | `members.js:82–85` |
| W4 | `adaptMember` maps `emergencyPhone` → `emergency` and `emergencyPhone2` → `emergency2`; initial bootstrap (`App.jsx:9465–9470`) does the same inline | `App.jsx:3410–3416`, `9465–9470` |
| W5 | Member Add and Edit modals both render Emergency Contact 1 and 2 inputs | `App.jsx:3823–3824` |

The members path is correctly wired end-to-end with the single caveat in M1 above.

---

## What "earlier saved" probably means in the field

Given the audit, the user's "this was saved earlier" complaint splits cleanly:

- **For a walk-in:** the value was never persisted at all. The Add modal accepted it, the screen confirmed success, but the DB row was written without it. Every Edit Walk-In opens to blank. This is C1.
- **For a member:** the value almost certainly *is* in the DB on rows created since the form added the fields. If a specific row really opens blank, the candidates are:
  1. The row was created before the form had Emergency 2 (or even Emergency 1) — the column is `NULL` and will stay `NULL` until someone types a value in.
  2. M1 was triggered: someone cleared the field and saved, but the change didn't take effect; on the next visit the field is still whatever it was — possibly blank for an old row.
  3. The wrong row is being inspected (e.g. a duplicate created by the dual-call assign-plan flow in `MEMBERSHIP_PAYMENT_VALIDATION.md` H2).

A quick way to confirm (2) vs (1) for a specific complaint: query `SELECT id, first_name, last_name, emergency_phone, emergency_phone_2, created_at, updated_at FROM members WHERE …` directly against Render. If `updated_at` is recent but the columns are NULL, M1 is at fault. If `updated_at` matches `created_at` and both predate the form change, (1) is.

---

## Suggested triage order

1. **Stop the bleeding on walk-ins.** Add `emergency_phone`, `emergency_phone_2`, `gender`, and `emergency_name` columns to `walk_ins` (new migration), extend the route `FIELDS` whitelist + validators, then teach `walkInsApi.create`/`update` and `adaptWalkIn` to round-trip them. This is C1 + L1 + H2 in one pass.
2. **Make the Edit Walk-In modal field set match Add.** Add the missing Emergency Contact 2 input plus any other parity fixes (H1).
3. **Fix the M1 PATCH-clearing bug** for members. One-line change to `memberFormToApi`. Cheap insurance against the most plausible "it disappeared on me" report.
4. **Decide on `emergency_name`** — either wire it through to the form (M2) or remove the column to avoid future confusion.
5. **Add the two round-trip tests** (L4) so this category of bug shows up in CI rather than from staff at the front desk.
