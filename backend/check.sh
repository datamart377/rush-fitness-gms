#!/usr/bin/env bash
# Quick diagnostic — confirms backend, DB, and login all work end-to-end.
# Run from the backend/ folder:  ./check.sh
set -u

API="http://127.0.0.1:4000"
USER="admin"
PASS="Admin@12345"

echo "1. Postgres running?"
brew services list 2>/dev/null | grep -E "postgresql" || echo "   (brew not available — skipping)"
echo

echo "2. Anything listening on :4000?"
lsof -nP -i :4000 -sTCP:LISTEN 2>/dev/null | tail -n +2 || echo "   (nothing — start backend with 'npm run dev')"
echo

echo "3. /api/health"
curl -sS --max-time 5 -i "$API/api/health" | head -10 || echo "   FAILED — backend not reachable"
echo
echo

echo "4. /api/auth/login (admin / Admin@12345)"
curl -sS --max-time 5 -i -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" | head -20
echo
echo "Done. If step 3 returned 200 and step 4 returned 200 with a token, the backend is fully working."
