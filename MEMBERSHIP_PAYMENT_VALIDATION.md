# Membership & Payment Functionality — Validation Report

_Date: 2026-05-27 · Scope: `backend/src/routes/memberships.js`, `backend/src/routes/payments.js`, `backend/migrations/001_initial_schema.sql`, `src/App.jsx`, `src/api/client.js`._

This report walks every membership and payment flow end-to-end, flags defects by severity, and lists the parts that are working correctly. No code was modified.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 2 |
| Medium | 3 |
| Low / Observation | 6 |
| Confirmed working | 9 |

The single biggest risk is now the **refund path** — after the recent `getMembershipBalance` fix that made `ms.totalPaid` the canonical source of truth, the refund endpoint no longer keeps that field accurate. It is currently masked only because no UI button calls it.

---

## Critical

### C1. Refund does not decrement `memberships.total_paid`
**Where:** `backend/src/routes/payments.js` lines 102–114.

```js
router.post('/:id/refund', ...
  const r = await pool.query(
    `UPDATE ${TABLE} SET status = 'refunded' WHERE id = $1 AND status = 'completed' RETURNING *`,
    [req.params.id]
  );
```

The route only flips `payments.status` to `'refunded'`. The matching `memberships.total_paid` is never adjusted, even though `POST /payments` bumps it on the way in (lines 88–93).

After the recent canonical-source change (`getMembershipBalance` reads `ms.totalPaid` directly), the UI will show a refunded membership as still **Paid in Full** even though the money went back to the member. The "Total Paid" column will be wrong for any refunded payment.

**Currently masked** because no React component calls `paymentsApi.refund(id)` (see L1). It becomes a live data-integrity bug the moment a refund button is wired up.

---

## High

### H1. `topUp()` is in-memory only — never persists
**Where:** `src/App.jsx` lines 3913–3937.

```js
const topUp = () => {
  ...
  setData((d) => ({
    ...d,
    payments: [...d.payments, newPay],
    memberships: d.memberships.map((ms) => ms.id === payTarget.id ? { ... } : ms),
  }));
};
```

No `paymentsApi.create` call. No `membershipsApi.update`. The top-up only mutates React state; the row reverts on the next `reloadMemberships()` (and on full page reload). For pre-paid plans this means staff can "add credit" that vanishes.

Secondary issue: even if a backend call were added, `payment.type = "prepaid_deposit"` would be rejected by the backend validator at `payments.js:78`, which only accepts `['membership','addon','walk_in','product','other']`.

### H2. Assign Plan is not transactional across membership + payment
**Where:** `src/App.jsx` lines 3786–3835 (group flow) and 3858–3897 (single flow).

Both flows do:

```js
const ms = await membershipsApi.create({ ... });   // POST /memberships
...
await paymentsApi.create({ membershipId: ms.id, ... }); // POST /payments
```

These are two separate HTTP calls with no compensating rollback. Failure modes:

- **Single member:** payment POST fails (network blip, 400 on bad reference, 401 token refresh) → membership row exists with `total_paid = 0` and `status = 'active'` (the DB default). The member has free gym access until someone notices.
- **Group plan (`for (const memberId of ids)`)**: if the loop fails mid-iteration, members 1…k were charged and members k+1…size have orphan memberships. No retry / cleanup logic.

Mitigation today: the overlap guard on POST `/memberships` prevents a second attempt from duplicating a row, but it doesn't catch the orphan-membership case.

---

## Medium

### M1. Backend `POST /payments` has no overpayment cap
**Where:** `backend/src/routes/payments.js` line 69 — `body('amount').isFloat({ min: 0 })`.

The validator only enforces `amount >= 0`. The frontend `recordPayment` defensively does `Math.min(payAmount, bal.balance)` (App.jsx:3942), but any direct API call — or a future UI bug — can push `memberships.total_paid` above `total_due`, breaking the "Paid in Full" semantic and bal.balance going negative.

### M2. `memberships` default status = 'active' before any payment is recorded
**Where:** `backend/migrations/001_initial_schema.sql` (memberships table default) + `memberships.js:65–138` POST handler.

POST `/memberships` doesn't accept a `status` field, so the DB default applies — the row is **active** the instant it's inserted, even with `total_paid = 0`. Combined with H2, a payment-side failure leaves the member with a fully usable membership and zero recorded payment.

A safer default would be `pending_payment`, flipped to `active` only after `total_paid >= total_due` (or after a configurable deposit threshold).

### M3. `recordPayment` allows a zero-balance no-op to look successful
**Where:** `src/App.jsx` lines 3939–3966.

```js
const payAmount = Math.min(Number(form.paymentAmount) || 0, bal.balance);
if (payAmount <= 0) return;
```

If the user clicks "Record Payment" after a sibling tab already cleared the balance, `bal.balance` is 0, `payAmount` becomes 0, and the function silently returns without closing the modal or surfacing an error. From the user's perspective the button is dead. Better UX: explain why nothing happened.

---

## Low / Observation

### L1. No UI for `membershipsApi.cancel` or `paymentsApi.refund`
**Where:** `src/api/client.js:124, 127`. Grep for `.cancel(` and `.refund(` in `src/` finds zero callers.

The backend supports both, but staff currently have no in-app way to cancel a stuck membership or refund a payment. PATCH `/memberships/:id` explicitly excludes `status` from the editable fields (memberships.js:217–225), so even admins can't fix this via the Edit modal.

### L2. `getMembershipBalance` still takes a `payments` arg that it ignores
**Where:** `src/App.jsx` line 3633.

```js
const getMembershipBalance = (ms /* , payments */) => { ... };
```

Call sites still pass `data.payments` (App.jsx:3901, 3941, 3997, 4030). Harmless, but dead weight that invites future confusion ("which is the real source of truth?").

### L3. Freeze adds days to `end_date`, unfreeze never reclaims unused days
**Where:** `backend/src/routes/memberships.js` lines 234–267.

`POST /freeze` extends `end_date` by `+ $1::int` days and bumps `frozen_days`. `POST /unfreeze` only flips status back to `'active'`. If a member freezes for 30 days but returns on day 10, they keep all 30 bonus days. May be intentional; flagging as a product decision.

### L4. Overlap guard on POST is strict, but cancellation creates a "free slot"
**Where:** `memberships.js:99–120`.

The guard requires `status IN ('active','frozen')`. After a cancel, the row no longer blocks. This is correct behaviour for legitimate upgrades, but means an admin who cancels by mistake can immediately create an overlapping row. PATCH guard correctly excludes the current row by id.

### L5. PATCH overlap check uses re-resolved date pair but skips itself
**Where:** `memberships.js:189–213`.

Correct logic — included for completeness. Worth keeping a test fixture for the case where only `endDate` is patched (the fallback `fmtDate(cur.start_date)` carries the original start through).

### L6. No automated tests
No `*.test.js` / `*.spec.js` files found under `backend/src` or `src/`. All bugs above are detectable only by manual QA today. The membership/payment flows are exactly the kind of money-touching logic that benefits most from a small integration suite (supertest + a throwaway Postgres).

---

## Confirmed working

| # | Behaviour | Reference |
|---|---|---|
| W1 | `getMembershipBalance` reads `ms.totalPaid` directly — single source of truth | App.jsx:3633–3636 |
| W2 | `POST /payments` bumps `memberships.total_paid` inside `withTx` | payments.js:80–99 |
| W3 | `POST /memberships` overlap guard uses `FOR UPDATE` row locks (race-safe) | memberships.js:99–120 |
| W4 | `PATCH /memberships` re-runs overlap guard when dates change | memberships.js:189–213 |
| W5 | PATCH whitelist via `FIELDS` blocks tampering with `member_id`, `status`, `created_by` | memberships.js:14–17, 217–225 |
| W6 | `PATCH /memberships` accepts and persists `totalPaid` (the "edit doesn't take effect" symptom was the frontend display, now fixed) | memberships.js:14, 159, 222 |
| W7 | Freeze, unfreeze, cancel routes use parameterised SQL and return camelised rows | memberships.js:234–283 |
| W8 | `recordPayment` clamps `payAmount` to `bal.balance` so the UI cannot intentionally overpay | App.jsx:3942 |
| W9 | Expired-but-paid row color now returns `var(--danger)` instead of grey | App.jsx ~4075–4085 |

---

## Suggested triage order

1. **Decide refund policy** before wiring a refund button. Either fix C1 (decrement `total_paid` in the same transaction) or document that refunds are accounting-only and don't unwind the balance.
2. **Fix H1 (topUp persistence)** — currently the only user-visible regression in normal operation.
3. **Wrap Assign Plan in a single backend endpoint** that takes both membership + initial payment, runs inside one `withTx`, and either both succeed or neither does. Replaces the two-call sequence in H2.
4. **Tighten M1 / M2 / M3** as a single defensive pass: cap on amount, status default of `pending_payment`, friendlier no-op handling.
5. **Add minimal supertest coverage** for the four most important paths: assign + pay, partial pay then top up, edit totalPaid, freeze→unfreeze→cancel.
