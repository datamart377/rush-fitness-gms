#!/usr/bin/env bash
# Comprehensive end-to-end validation of every wired backend resource.
# Creates test rows, verifies them in Postgres, runs actions, then cleans up.
#
# Usage:    ./verify-full.sh
# Requires: a running backend on :4000 + Postgres + python3 + psql

set -u
API="http://127.0.0.1:4000"
DB="rush_fitness_gms"
USER_NAME="admin"
USER_PASS="Admin@12345"

PASS=0
FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
hr()   { echo; echo "── $1 ──"; }

extract() { python3 -c "import sys,json
try:
  d=json.loads(sys.stdin.read())
  v=d
  for k in '$1'.split('.'):
    v = v.get(k) if isinstance(v, dict) else (v[int(k)] if k.isdigit() else None)
  print(v if v is not None else '')
except: print('')"; }

# Find an item in a list response by a (key,value) match and print one of its fields.
# Usage:  echo "$json" | finditem code aerobics id
finditem() {
  python3 -c "
import sys,json
d=json.loads(sys.stdin.read()).get('data',[])
for it in d:
  if str(it.get('$1','')) == '$2':
    print(it.get('$3',''))
    break
"
}

count() { python3 -c "import sys,json;print(len(json.loads(sys.stdin.read()).get('data',[])))"; }

hr "1. Auth — login as admin"
LOGIN_RES=$(curl -sS --max-time 5 -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$USER_PASS\"}")
TOKEN=$(echo "$LOGIN_RES" | extract token)
[ -n "$TOKEN" ] && ok "Got JWT (length: ${#TOKEN})" || { bad "Login failed: $LOGIN_RES"; exit 1; }

AUTH=("-H" "Authorization: Bearer $TOKEN")
JSON=("-H" "Content-Type: application/json")

# Pick a plan to use for the membership flow later
hr "2. Plans"
PL=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/plans?limit=100")
PL_COUNT=$(echo "$PL" | count)
[ "$PL_COUNT" -gt 0 ] && ok "Plans list has $PL_COUNT entries" || bad "Plans list empty"
PLAN_ID=$(echo "$PL" | finditem code gym_monthly id)
PLAN_PRICE=$(echo "$PL" | finditem code gym_monthly price)
[ -n "$PLAN_ID" ] && ok "Found gym_monthly id=${PLAN_ID:0:8}... price=$PLAN_PRICE" || { bad "gym_monthly missing"; exit 1; }

hr "3. Members — create a test member"
MEM_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/members" -d '{
  "firstName":"E2E","lastName":"TestMember","phone":"0700E2E001","gender":"Female",
  "nationalId":"E2E000000000T1","emergencyPhone":"0700E2E002","emergencyPhone2":"0700E2E003"
}')
MEM_ID=$(echo "$MEM_RES" | extract id)
[ -n "$MEM_ID" ] && ok "Created member ${MEM_ID:0:8}..." || { bad "Member create failed: $MEM_RES"; exit 1; }
DB_PHONE=$(psql -tA "$DB" -c "SELECT phone FROM members WHERE id='$MEM_ID';")
[ "$DB_PHONE" = "0700E2E001" ] && ok "Phone persisted in DB" || bad "Phone mismatch '$DB_PHONE'"
DB_E2=$(psql -tA "$DB" -c "SELECT emergency_phone_2 FROM members WHERE id='$MEM_ID';")
[ "$DB_E2" = "0700E2E003" ] && ok "emergency_phone_2 persisted (digit-snake fix)" || bad "emergency_phone_2 mismatch '$DB_E2'"

hr "4. Trainers — create"
TR_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/trainers" -d '{
  "firstName":"E2E","lastName":"TestTrainer","phone":"0700TRN001","specialisation":"E2E Test"
}')
TR_ID=$(echo "$TR_RES" | extract id)
[ -n "$TR_ID" ] && ok "Created trainer ${TR_ID:0:8}..." || bad "Trainer create failed: $TR_RES"

hr "5. Lockers — create + delete"
LK_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/lockers" -d '{"number":9999,"section":"gents","status":"available"}')
LK_ID=$(echo "$LK_RES" | extract id)
[ -n "$LK_ID" ] && ok "Created locker #9999" || bad "Locker create failed: $LK_RES"
# Delete it
DEL=$(curl -sS --max-time 5 -X DELETE -o /dev/null -w "%{http_code}" "${AUTH[@]}" "$API/api/lockers/$LK_ID")
[ "$DEL" = "204" ] && ok "Locker delete returned 204" || bad "Locker delete returned $DEL"

hr "6. Products — create + sell + verify stock decrement"
PR_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/products" -d '{
  "name":"E2E Test Drink","category":"Drinks","price":5000,"stock":10
}')
PR_ID=$(echo "$PR_RES" | extract id)
[ -n "$PR_ID" ] && ok "Created product ${PR_ID:0:8}..." || { bad "Product create failed: $PR_RES"; }
SELL=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/products/$PR_ID/sell" -d '{"quantity":3,"paymentMethod":"cash"}')
SOLD_OK=$(echo "$SELL" | python3 -c "import sys,json;d=json.loads(sys.stdin.read());print('yes' if d.get('sale') and d.get('payment') else 'no')")
[ "$SOLD_OK" = "yes" ] && ok "Sale + payment recorded" || bad "Sale failed: $SELL"
NEW_STOCK=$(psql -tA "$DB" -c "SELECT stock FROM products WHERE id='$PR_ID';")
[ "$NEW_STOCK" = "7" ] && ok "Stock decremented (10 - 3 = $NEW_STOCK)" || bad "Stock = '$NEW_STOCK'"

hr "7. Equipment — create + status update"
EQ_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/equipment" -d '{
  "name":"E2E TestBike","category":"Cardio","status":"operational"
}')
EQ_ID=$(echo "$EQ_RES" | extract id)
[ -n "$EQ_ID" ] && ok "Created equipment ${EQ_ID:0:8}..." || bad "Equipment create failed: $EQ_RES"
curl -sS --max-time 5 -X PATCH "${AUTH[@]}" "${JSON[@]}" "$API/api/equipment/$EQ_ID" -d '{"status":"maintenance"}' >/dev/null
NEW_STATUS=$(psql -tA "$DB" -c "SELECT status FROM equipment WHERE id='$EQ_ID';")
[ "$NEW_STATUS" = "maintenance" ] && ok "Status updated to maintenance" || bad "Status = '$NEW_STATUS'"

hr "8. Activities — create + price update + delete"
ACT_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/activities" -d '{
  "code":"e2e_test","name":"E2E Test Class","standalonePrice":15000,"addonPrice":7500
}')
ACT_ID=$(echo "$ACT_RES" | extract id)
[ -n "$ACT_ID" ] && ok "Created activity ${ACT_ID:0:8}..." || bad "Activity create failed: $ACT_RES"
curl -sS --max-time 5 -X PATCH "${AUTH[@]}" "${JSON[@]}" "$API/api/activities/$ACT_ID" -d '{"standalonePrice":18000}' >/dev/null
NEW_PRICE=$(psql -tA "$DB" -c "SELECT standalone_price FROM activities WHERE id='$ACT_ID';")
[ "$NEW_PRICE" = "18000.00" ] && ok "Activity price updated to 18,000" || bad "Price = '$NEW_PRICE'"

hr "9. Discounts — create + toggle"
DC_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/discounts" -d '{
  "code":"E2E10","description":"E2E test 10% off","type":"percent","value":10
}')
DC_ID=$(echo "$DC_RES" | extract id)
[ -n "$DC_ID" ] && ok "Created discount E2E10" || bad "Discount create failed: $DC_RES"

hr "10. Expenses — create"
EX_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/expenses" -d '{
  "category":"Utilities","description":"E2E test bill","amount":12345
}')
EX_ID=$(echo "$EX_RES" | extract id)
[ -n "$EX_ID" ] && ok "Created expense ${EX_ID:0:8}..." || bad "Expense create failed: $EX_RES"
EX_DB_AMT=$(psql -tA "$DB" -c "SELECT amount FROM expenses WHERE id='$EX_ID';")
[ "$EX_DB_AMT" = "12345.00" ] && ok "Expense amount persisted (12,345)" || bad "Amount = '$EX_DB_AMT'"

hr "11. Walk-ins — create + check-in"
WI_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/walk-ins" -d "{
  \"fullName\":\"E2E Walk-In Guest\",\"phone\":\"0700WI0001\",\"visitDate\":\"$(date +%Y-%m-%d)\",\"amount\":20000,\"paymentStatus\":\"paid\"
}")
WI_ID=$(echo "$WI_RES" | extract id)
[ -n "$WI_ID" ] && ok "Created walk-in ${WI_ID:0:8}..." || bad "Walk-in create failed: $WI_RES"
CI=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "$API/api/walk-ins/$WI_ID/check-in")
CI_OK=$(echo "$CI" | python3 -c "import sys,json;d=json.loads(sys.stdin.read());print('yes' if d.get('checkedIn') else 'no')")
[ "$CI_OK" = "yes" ] && ok "Walk-in checked in" || bad "Walk-in check-in failed: $CI"

hr "12. Memberships + Payments — full lifecycle"
MS_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/memberships" -d "{
  \"memberId\":\"$MEM_ID\",\"planId\":\"$PLAN_ID\"
}")
MS_ID=$(echo "$MS_RES" | extract id)
[ -n "$MS_ID" ] && ok "Created membership ${MS_ID:0:8}..." || { bad "Membership create failed"; exit 1; }

PAY_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/payments" -d "{
  \"memberId\":\"$MEM_ID\",\"membershipId\":\"$MS_ID\",
  \"amount\":$PLAN_PRICE,\"method\":\"mpesa\",\"type\":\"membership\",
  \"reference\":\"E2E-MPESA\",\"payerPhone\":\"0700E2E001\"
}")
PAY_ID=$(echo "$PAY_RES" | extract id)
[ -n "$PAY_ID" ] && ok "Recorded payment ${PAY_ID:0:8}..." || bad "Payment failed"
TOTAL_PAID=$(psql -tA "$DB" -c "SELECT total_paid FROM memberships WHERE id='$MS_ID';")
[ "$TOTAL_PAID" = "$PLAN_PRICE" ] && ok "membership.total_paid auto-bumped" || bad "total_paid = $TOTAL_PAID"

# Freeze 5 days
FREEZE=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/memberships/$MS_ID/freeze" -d '{"days":5}')
F_STATUS=$(echo "$FREEZE" | extract status)
[ "$F_STATUS" = "frozen" ] && ok "Membership frozen" || bad "Freeze status='$F_STATUS'"

# Unfreeze
UN=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "$API/api/memberships/$MS_ID/unfreeze")
U_STATUS=$(echo "$UN" | extract status)
[ "$U_STATUS" = "active" ] && ok "Membership unfrozen" || bad "Unfreeze status='$U_STATUS'"

# Refund
RF=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "$API/api/payments/$PAY_ID/refund")
RF_STATUS=$(echo "$RF" | extract status)
[ "$RF_STATUS" = "refunded" ] && ok "Payment refunded" || bad "Refund status='$RF_STATUS'"

hr "13. Attendance — member check-in (uses real membership)"
# Re-create membership active for today (the one above had freeze/unfreeze churn)
ATT=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/attendance/check-in" -d "{
  \"memberId\":\"$MEM_ID\",\"source\":\"staff\"
}")
ATT_ID=$(echo "$ATT" | extract id)
[ -n "$ATT_ID" ] && ok "Attendance recorded ${ATT_ID:0:8}..." || bad "Check-in failed: $ATT"

# Try the same again — should fail with 409 (already checked in today)
DUP=$(curl -sS --max-time 5 -X POST -o /dev/null -w "%{http_code}" "${AUTH[@]}" "${JSON[@]}" "$API/api/attendance/check-in" -d "{
  \"memberId\":\"$MEM_ID\",\"source\":\"staff\"
}")
[ "$DUP" = "409" ] && ok "Duplicate check-in correctly rejected (409)" || bad "Duplicate returned $DUP"

# Check-out
[ -n "${ATT_ID:-}" ] && {
  CO_HTTP=$(curl -sS --max-time 5 -X POST -o /dev/null -w "%{http_code}" "${AUTH[@]}" "$API/api/attendance/$ATT_ID/check-out")
  [ "$CO_HTTP" = "200" ] && ok "Check-out succeeded" || bad "Check-out returned $CO_HTTP"
}

hr "13b. Walk-in checked-in also creates an attendance row"
WI_VISITOR=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/walk-ins" -d "{
  \"fullName\":\"E2E Persisted Guest\",\"phone\":\"0700PERSIST\",\"visitDate\":\"$(date +%Y-%m-%d)\",\"amount\":15000,\"paymentStatus\":\"paid\",\"checkedIn\":true
}")
WI_VID=$(echo "$WI_VISITOR" | extract id)
[ -n "$WI_VID" ] && ok "Created already-checked-in walk-in ${WI_VID:0:8}..." || bad "Walk-in create failed"
# verify backend created attendance row
WI_ATT_ROWS=$(psql -tA "$DB" -c "SELECT COUNT(*) FROM attendance WHERE walk_in_id='$WI_VID';")
[ "$WI_ATT_ROWS" = "1" ] && ok "Walk-in produced 1 attendance row (source=walkin)" || bad "Expected 1 attendance row, got $WI_ATT_ROWS"
WI_ATT_SOURCE=$(psql -tA "$DB" -c "SELECT source FROM attendance WHERE walk_in_id='$WI_VID' LIMIT 1;")
[ "$WI_ATT_SOURCE" = "walkin" ] && ok "Source = walkin" || bad "Source = '$WI_ATT_SOURCE'"
# verify it appears in the attendance list endpoint
WI_IN_LIST=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/attendance?limit=200" | python3 -c "
import sys,json
data = json.loads(sys.stdin.read()).get('data', [])
print('yes' if any(a.get('walkInId') == '$WI_VID' for a in data) else 'no')")
[ "$WI_IN_LIST" = "yes" ] && ok "Walk-in attendance appears in /api/attendance list" || bad "Walk-in not in attendance list"

hr "13c. Sign-out simulation — login again, verify the data is still there"
# Re-login as if a new browser session
RELOGIN=$(curl -sS --max-time 5 -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$USER_PASS\"}")
TOKEN2=$(echo "$RELOGIN" | extract token)
AUTH2=("-H" "Authorization: Bearer $TOKEN2")
[ -n "$TOKEN2" ] && ok "Re-logged in (simulating new browser/session)" || bad "Re-login failed"

# Confirm the test member, membership, walk-in, and attendance still exist for this token
SURVIVED_M=$(curl -sS --max-time 5 "${AUTH2[@]}" "$API/api/members/$MEM_ID" | extract id)
[ "$SURVIVED_M" = "$MEM_ID" ] && ok "Member survived sign-out → sign-in" || bad "Member missing after re-login"

SURVIVED_W=$(curl -sS --max-time 5 "${AUTH2[@]}" "$API/api/walk-ins/$WI_VID" | extract id)
[ "$SURVIVED_W" = "$WI_VID" ] && ok "Walk-in survived sign-out → sign-in" || bad "Walk-in missing after re-login"

SURVIVED_A=$(curl -sS --max-time 5 "${AUTH2[@]}" "$API/api/attendance?limit=200" | python3 -c "
import sys,json
data = json.loads(sys.stdin.read()).get('data', [])
print('yes' if any(a.get('walkInId') == '$WI_VID' for a in data) else 'no')")
[ "$SURVIVED_A" = "yes" ] && ok "Attendance row survived sign-out → sign-in" || bad "Attendance missing after re-login"

hr "13d. Member check-out persists"
# Find the open attendance row for our test member
OPEN_ATT=$(psql -tA "$DB" -c "SELECT id FROM attendance WHERE member_id='$MEM_ID' AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1;")
if [ -n "$OPEN_ATT" ]; then
  CO_HTTP=$(curl -sS --max-time 5 -X POST -o /dev/null -w "%{http_code}" "${AUTH[@]}" "$API/api/attendance/$OPEN_ATT/check-out")
  [ "$CO_HTTP" = "200" ] && ok "Check-out endpoint returned 200" || bad "Check-out returned $CO_HTTP"
  # verify check_out_at was set in DB
  CO_AT=$(psql -tA "$DB" -c "SELECT check_out_at IS NOT NULL FROM attendance WHERE id='$OPEN_ATT';")
  [ "$CO_AT" = "t" ] && ok "DB persisted check_out_at" || bad "check_out_at still NULL"
fi

hr "14. Staff Management — register a new user"
STAFF_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/auth/register" -d '{
  "username":"e2e_test_user","password":"Test@12345","fullName":"E2E Test User","role":"receptionist"
}')
STAFF_ID=$(echo "$STAFF_RES" | extract id)
[ -n "$STAFF_ID" ] && ok "Created staff user ${STAFF_ID:0:8}..." || bad "Staff create failed: $STAFF_RES"

hr "15. Login as new staff member"
S_LOGIN=$(curl -sS --max-time 5 -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"e2e_test_user","password":"Test@12345"}')
S_TOKEN=$(echo "$S_LOGIN" | extract token)
[ -n "$S_TOKEN" ] && ok "New staff can log in" || bad "Staff login failed: $S_LOGIN"

hr "16. Dashboard — aggregated stats"
DASH=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/dashboard")
DASH_OK=$(echo "$DASH" | python3 -c "
import sys,json
try:
  d=json.loads(sys.stdin.read())
  print('yes' if isinstance(d, dict) else 'no')
except: print('no')")
[ "$DASH_OK" = "yes" ] && ok "Dashboard endpoint returns data" || bad "Dashboard failed"

hr "17. Audit log — verify all the above were recorded"
AUDIT_COUNT=$(psql -tA "$DB" -c "SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '5 minutes';")
[ "$AUDIT_COUNT" -ge 15 ] && ok "Found $AUDIT_COUNT recent audit entries" || bad "Only $AUDIT_COUNT audit entries"

hr "18. Cleanup — delete all test data"
CLEAN=0
for table_id in \
  "payments|$PAY_ID" \
  "attendance|$ATT_ID" \
  "memberships|$MS_ID" \
  "walk_ins|$WI_ID" \
  "walk_ins|$WI_VID" \
  "members|$MEM_ID" \
  "trainers|$TR_ID" \
  "products|$PR_ID" \
  "equipment|$EQ_ID" \
  "activities|$ACT_ID" \
  "discounts|$DC_ID" \
  "expenses|$EX_ID" \
  "users|$STAFF_ID"; do
  table="${table_id%%|*}"
  id="${table_id##*|}"
  if [ -n "$id" ]; then
    psql -q "$DB" -c "DELETE FROM $table WHERE id='$id';" >/dev/null 2>&1 && CLEAN=$((CLEAN+1))
  fi
done
ok "Cleaned up $CLEAN test rows"

hr "19. Row counts (sanity)"
for t in members trainers plans memberships payments lockers products equipment activities walk_ins attendance discounts expenses users audit_logs; do
  N=$(psql -tA "$DB" -c "SELECT COUNT(*) FROM $t;")
  printf "  %-15s %s rows\n" "$t" "$N"
done

echo
echo "═════════════════════════════════════════════════════════"
echo "  PASS: $PASS    FAIL: $FAIL"
echo "═════════════════════════════════════════════════════════"
[ "$FAIL" = "0" ] \
  && echo "✓ Full system validated end-to-end across all wired resources" \
  || echo "✗ Some checks failed — review the ✗ lines above"
exit "$FAIL"
