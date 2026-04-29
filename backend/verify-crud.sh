#!/usr/bin/env bash
# End-to-end consistency check: hits the API, reads back from Postgres,
# and verifies the round-trip. Fails fast if anything mismatches.
#
# Usage:    ./verify-crud.sh
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

extract() { python3 -c "import sys,json;print(json.loads(sys.stdin.read()).get('$1',''))"; }

hr "1. Login"
LOGIN_RES=$(curl -sS --max-time 5 -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$USER_PASS\"}")
TOKEN=$(echo "$LOGIN_RES" | extract token)
[ -n "$TOKEN" ] && ok "Got JWT token (length: ${#TOKEN})" || { bad "Login failed: $LOGIN_RES"; exit 1; }

AUTH=("-H" "Authorization: Bearer $TOKEN")
JSON=("-H" "Content-Type: application/json")

hr "2. List members (should include 4 seeded)"
LIST_RES=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/members?limit=10")
LIST_COUNT=$(echo "$LIST_RES" | python3 -c "import sys,json;print(len(json.loads(sys.stdin.read()).get('data',[])))")
[ "$LIST_COUNT" -ge 4 ] && ok "API returned $LIST_COUNT members" || bad "Expected >= 4 members, got $LIST_COUNT"

DB_COUNT=$(psql -tA "$DB" -c "SELECT COUNT(*) FROM members;")
[ "$LIST_COUNT" = "$DB_COUNT" ] && ok "API count ($LIST_COUNT) matches DB count ($DB_COUNT)" \
                                || bad "Mismatch: API=$LIST_COUNT, DB=$DB_COUNT"

hr "3. Create a member via API"
CREATE_BODY='{
  "firstName":"VerifyTest",
  "lastName":"Mwangi",
  "phone":"0700999111",
  "email":"verify-test@example.com",
  "gender":"Female",
  "dob":"1990-05-15",
  "nationalId":"CM90015001VTEST",
  "emergencyPhone":"0701234567",
  "emergencyPhone2":"0709876543",
  "pin":"4242"
}'
CREATE_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/members" -d "$CREATE_BODY")
NEW_ID=$(echo "$CREATE_RES" | extract id)
[ -n "$NEW_ID" ] && ok "Created member id=$NEW_ID" || { bad "Create failed: $CREATE_RES"; exit 1; }

# Verify in DB
DB_ROW=$(psql -tA -F'|' "$DB" -c "SELECT first_name, last_name, phone, email, gender, dob, national_id, emergency_phone, emergency_phone_2 FROM members WHERE id='$NEW_ID';")
echo "    DB row:  $DB_ROW"
case "$DB_ROW" in
  "VerifyTest|Mwangi|0700999111|verify-test@example.com|Female|1990-05-15|CM90015001VTEST|0701234567|0709876543")
    ok "All 9 fields match exactly between API request and DB row" ;;
  *) bad "DB row doesn't match input — see above" ;;
esac

# Verify pin was hashed (not stored plain)
PIN_HASH=$(psql -tA "$DB" -c "SELECT pin_hash FROM members WHERE id='$NEW_ID';")
case "$PIN_HASH" in
  '$2'*) ok "PIN was bcrypt-hashed (starts with \$2)" ;;
  *)     bad "PIN not hashed: '$PIN_HASH'" ;;
esac

hr "4. Read back via API"
READ_RES=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/members/$NEW_ID")
READ_PHONE=$(echo "$READ_RES" | extract phone)
[ "$READ_PHONE" = "0700999111" ] && ok "Phone round-trips correctly" || bad "Phone mismatch: '$READ_PHONE'"

hr "5. Update phone via API"
UPDATE_RES=$(curl -sS --max-time 5 -X PATCH "${AUTH[@]}" "${JSON[@]}" "$API/api/members/$NEW_ID" \
  -d '{"phone":"0711222333"}')
NEW_PHONE_API=$(echo "$UPDATE_RES" | extract phone)
[ "$NEW_PHONE_API" = "0711222333" ] && ok "API returned new phone" || bad "API didn't return new phone: $UPDATE_RES"

NEW_PHONE_DB=$(psql -tA "$DB" -c "SELECT phone FROM members WHERE id='$NEW_ID';")
[ "$NEW_PHONE_DB" = "0711222333" ] && ok "DB persisted new phone" || bad "DB phone wrong: '$NEW_PHONE_DB'"

hr "6. Search by phone via API"
SEARCH_RES=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/members?search=0711222333")
SEARCH_COUNT=$(echo "$SEARCH_RES" | python3 -c "import sys,json;print(len(json.loads(sys.stdin.read()).get('data',[])))")
[ "$SEARCH_COUNT" = "1" ] && ok "Search returned exactly 1 result" || bad "Search returned $SEARCH_COUNT results"

hr "7. Deactivate (PATCH isActive=false)"
DEACT_RES=$(curl -sS --max-time 5 -X PATCH "${AUTH[@]}" "${JSON[@]}" "$API/api/members/$NEW_ID" \
  -d '{"isActive":false}')
DEACT_DB=$(psql -tA "$DB" -c "SELECT is_active FROM members WHERE id='$NEW_ID';")
[ "$DEACT_DB" = "f" ] && ok "DB shows is_active=false" || bad "DB is_active wrong: '$DEACT_DB'"

hr "8. Filter active=false should include this member"
FILTER_RES=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/members?active=false&limit=50")
FOUND=$(echo "$FILTER_RES" | python3 -c "
import sys,json
data = json.loads(sys.stdin.read()).get('data', [])
print('yes' if any(m['id'] == '$NEW_ID' for m in data) else 'no')")
[ "$FOUND" = "yes" ] && ok "Active=false filter includes our member" || bad "Filter didn't include member"

hr "9. Delete via API"
DEL_HTTP=$(curl -sS --max-time 5 -X DELETE -o /dev/null -w "%{http_code}" "${AUTH[@]}" "$API/api/members/$NEW_ID")
[ "$DEL_HTTP" = "204" ] && ok "Delete returned 204" || bad "Delete returned $DEL_HTTP"

DB_GONE=$(psql -tA "$DB" -c "SELECT COUNT(*) FROM members WHERE id='$NEW_ID';")
[ "$DB_GONE" = "0" ] && ok "Member is gone from DB" || bad "Member still in DB ($DB_GONE rows)"

hr "10. Audit log entries"
AUDIT_COUNT=$(psql -tA "$DB" -c "SELECT COUNT(*) FROM audit_logs WHERE entity_id='$NEW_ID' OR action LIKE 'auth.%' AND created_at > NOW() - INTERVAL '5 minutes';")
[ "$AUDIT_COUNT" -ge 4 ] && ok "Found $AUDIT_COUNT audit entries (login/create/update/delete)" \
                        || bad "Only $AUDIT_COUNT audit entries — expected >= 4"

hr "11. Plans — fetch list and pick a monthly gym plan"
PLANS_RES=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/plans?limit=100")
PLAN_ID=$(echo "$PLANS_RES" | python3 -c "
import sys,json
data = json.loads(sys.stdin.read()).get('data', [])
m = next((p for p in data if p.get('code') == 'gym_monthly'), None)
print(m['id'] if m else '')")
PLAN_PRICE=$(echo "$PLANS_RES" | python3 -c "
import sys,json
data = json.loads(sys.stdin.read()).get('data', [])
m = next((p for p in data if p.get('code') == 'gym_monthly'), None)
print(m['price'] if m else '')")
PLAN_DAYS=$(echo "$PLANS_RES" | python3 -c "
import sys,json
data = json.loads(sys.stdin.read()).get('data', [])
m = next((p for p in data if p.get('code') == 'gym_monthly'), None)
print(m['durationDays'] if m else '')")
[ -n "$PLAN_ID" ] && ok "Found gym_monthly plan id=${PLAN_ID:0:8}... price=$PLAN_PRICE days=$PLAN_DAYS" \
                  || { bad "gym_monthly plan not found"; exit 1; }

hr "12. Create a fresh member for the membership test"
MEM_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/members" -d '{
  "firstName":"MembershipTest","lastName":"Achieng","phone":"0700111222","gender":"Female"
}')
MEM_ID=$(echo "$MEM_RES" | extract id)
[ -n "$MEM_ID" ] && ok "Created member id=${MEM_ID:0:8}..." || { bad "Create member failed: $MEM_RES"; exit 1; }

hr "13. Create membership"
MS_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/memberships" -d "{
  \"memberId\":\"$MEM_ID\",\"planId\":\"$PLAN_ID\"
}")
MS_ID=$(echo "$MS_RES" | extract id)
[ -n "$MS_ID" ] && ok "Created membership id=${MS_ID:0:8}..." || { bad "Create membership failed: $MS_RES"; exit 1; }

# Verify DB row
MS_DB=$(psql -tA -F'|' "$DB" -c "SELECT plan_id::text, total_due::text, total_paid::text, status, (end_date - start_date)::text FROM memberships WHERE id='$MS_ID';")
echo "    DB row: $MS_DB"
case "$MS_DB" in
  "$PLAN_ID|$PLAN_PRICE|0.00|active|$PLAN_DAYS")
    ok "Membership saved with correct plan, price, status, and duration" ;;
  *) bad "Membership DB row doesn't match expected" ;;
esac

hr "14. Create payment for the membership (full payment in KES)"
PAY_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/payments" -d "{
  \"memberId\":\"$MEM_ID\",\"membershipId\":\"$MS_ID\",
  \"amount\":$PLAN_PRICE,\"method\":\"mpesa\",\"type\":\"membership\",
  \"reference\":\"TEST-MPESA-001\",\"payerPhone\":\"0700111222\"
}")
PAY_ID=$(echo "$PAY_RES" | extract id)
[ -n "$PAY_ID" ] && ok "Payment recorded id=${PAY_ID:0:8}..." || { bad "Payment failed: $PAY_RES"; exit 1; }

# Currency should be KES
PAY_CUR=$(psql -tA "$DB" -c "SELECT currency FROM payments WHERE id='$PAY_ID';")
[ "$PAY_CUR" = "KES" ] && ok "Currency = KES" || bad "Currency = '$PAY_CUR' (expected KES)"

# Membership.total_paid should auto-bump to plan price
TOTAL_PAID=$(psql -tA "$DB" -c "SELECT total_paid FROM memberships WHERE id='$MS_ID';")
[ "$TOTAL_PAID" = "$PLAN_PRICE" ] && ok "membership.total_paid auto-bumped to $TOTAL_PAID" \
                                   || bad "total_paid = '$TOTAL_PAID' (expected $PLAN_PRICE)"

hr "15. Freeze membership for 7 days"
ORIG_END=$(psql -tA "$DB" -c "SELECT end_date FROM memberships WHERE id='$MS_ID';")
FREEZE_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "${JSON[@]}" "$API/api/memberships/$MS_ID/freeze" -d '{"days":7}')
FREEZE_STATUS=$(echo "$FREEZE_RES" | extract status)
[ "$FREEZE_STATUS" = "frozen" ] && ok "Status = frozen" || bad "Status = '$FREEZE_STATUS'"

NEW_END=$(psql -tA "$DB" -c "SELECT end_date FROM memberships WHERE id='$MS_ID';")
EXPECTED_END=$(psql -tA "$DB" -c "SELECT (DATE '$ORIG_END' + 7)::text;")
[ "$NEW_END" = "$EXPECTED_END" ] && ok "end_date extended by 7 days ($ORIG_END → $NEW_END)" \
                                  || bad "end_date wrong: '$NEW_END' (expected '$EXPECTED_END')"

FROZEN_DAYS=$(psql -tA "$DB" -c "SELECT frozen_days FROM memberships WHERE id='$MS_ID';")
[ "$FROZEN_DAYS" = "7" ] && ok "frozen_days = 7" || bad "frozen_days = '$FROZEN_DAYS'"

hr "16. Unfreeze"
UNFREEZE_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "$API/api/memberships/$MS_ID/unfreeze")
UNFREEZE_STATUS=$(echo "$UNFREEZE_RES" | extract status)
[ "$UNFREEZE_STATUS" = "active" ] && ok "Status back to active" || bad "Status = '$UNFREEZE_STATUS'"

hr "17. Refund the payment"
REFUND_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "$API/api/payments/$PAY_ID/refund")
REFUND_STATUS=$(echo "$REFUND_RES" | extract status)
[ "$REFUND_STATUS" = "refunded" ] && ok "Payment refunded" || bad "Status = '$REFUND_STATUS'"

# Refunding twice should fail
REFUND2=$(curl -sS --max-time 5 -X POST -o /dev/null -w "%{http_code}" "${AUTH[@]}" "$API/api/payments/$PAY_ID/refund")
[ "$REFUND2" = "409" ] && ok "Double-refund correctly rejected with 409" || bad "Double-refund returned $REFUND2"

hr "18. Cancel membership"
CANCEL_RES=$(curl -sS --max-time 5 -X POST "${AUTH[@]}" "$API/api/memberships/$MS_ID/cancel")
CANCEL_STATUS=$(echo "$CANCEL_RES" | extract status)
[ "$CANCEL_STATUS" = "cancelled" ] && ok "Status = cancelled" || bad "Status = '$CANCEL_STATUS'"

hr "19. Filter memberships by member"
BY_MEMBER=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/memberships?memberId=$MEM_ID")
BY_MEMBER_COUNT=$(echo "$BY_MEMBER" | python3 -c "import sys,json;print(len(json.loads(sys.stdin.read()).get('data',[])))")
[ "$BY_MEMBER_COUNT" = "1" ] && ok "Filter ?memberId=... returned 1 result" || bad "Got $BY_MEMBER_COUNT results"

hr "20. Payments summary by member"
PAY_LIST=$(curl -sS --max-time 5 "${AUTH[@]}" "$API/api/payments?memberId=$MEM_ID")
PAY_COUNT=$(echo "$PAY_LIST" | python3 -c "import sys,json;print(len(json.loads(sys.stdin.read()).get('data',[])))")
PAY_TOTAL=$(echo "$PAY_LIST" | python3 -c "import sys,json;print(json.loads(sys.stdin.read()).get('summary',{}).get('totalAmount',0))")
[ "$PAY_COUNT" = "1" ] && ok "1 payment for member" || bad "Got $PAY_COUNT payments"
echo "    Total amount: KES $PAY_TOTAL"

hr "21. Cleanup test data"
psql -q "$DB" -c "DELETE FROM payments WHERE id='$PAY_ID';" >/dev/null && ok "Deleted test payment" || bad "Cleanup payment failed"
psql -q "$DB" -c "DELETE FROM memberships WHERE id='$MS_ID';" >/dev/null && ok "Deleted test membership" || bad "Cleanup membership failed"
psql -q "$DB" -c "DELETE FROM members WHERE id='$MEM_ID';" >/dev/null && ok "Deleted test member" || bad "Cleanup member failed"

hr "22. Other tables — sanity check counts"
for table in users plans activities lockers products equipment audit_logs; do
  N=$(psql -tA "$DB" -c "SELECT COUNT(*) FROM $table;")
  echo "  $table: $N rows"
done

echo
echo "═════════════════════════════════════════════"
echo "  PASS: $PASS    FAIL: $FAIL"
echo "═════════════════════════════════════════════"
[ "$FAIL" = "0" ] && echo "✓ Full backend consistency verified — members + plans + memberships + payments + freeze/cancel/refund + audit" \
                 || echo "✗ Inconsistencies detected — review failures above"
exit "$FAIL"
