#!/usr/bin/env bash
# Smoke: Mass-Assignment auf sachverstaendige + makler (RLS-Audit #2).
#
# Angriff: SV-User patcht eigene Row in `sachverstaendige` mit `verifiziert=true`.
# Makler-User analog mit `provision_aktiv=true` / `provision_betrag_cent=999900`.
# RLS-Policy erlaubt UPDATE auf eigene Row → privilege escalation ohne Admin-Check.
#
# Heute (vor Migration): PATCH liefert 200 + setzt das Flag (ANGRIFF MOEGLICH).
# Nach Migration: Trigger guard_sachverstaendige_privilegien wirft 42501 (BLOCKIERT).

set -u

: "${SUPABASE_URL:?SUPABASE_URL muss gesetzt sein}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY muss gesetzt sein}"
: "${SMOKE_SV_EMAIL:=test-sv@claimondo.de}"
: "${SMOKE_PASSWORD:=Test1234!}"

echo "=== Smoke #2 — Mass-Assignment sachverstaendige.verifiziert ==="
echo "Target: $SUPABASE_URL"
echo "Test-User: $SMOKE_SV_EMAIL"

# Login
token_response=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_SV_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}" 2>/dev/null)

access_token=$(echo "$token_response" | (command -v jq >/dev/null && jq -r '.access_token' || sed 's/.*"access_token":"\([^"]*\)".*/\1/'))
sv_uid=$(echo "$token_response" | (command -v jq >/dev/null && jq -r '.user.id' || sed 's/.*"id":"\([^"]*\)".*/\1/'))

if [ -z "$access_token" ] || [ "$access_token" = "null" ]; then
  echo "  → Login fehlgeschlagen"
  exit 2
fi

# Eigene sachverstaendige-Row finden
sv_id=$(curl -s "$SUPABASE_URL/rest/v1/sachverstaendige?select=id&user_id=eq.$sv_uid&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $access_token" 2>/dev/null \
  | (command -v jq >/dev/null && jq -r '.[0].id' || sed 's/.*"id":"\([^"]*\)".*/\1/'))

if [ -z "$sv_id" ] || [ "$sv_id" = "null" ]; then
  echo "  → SKIP — keine sachverstaendige-Row für user_id=$sv_uid"
  exit 0
fi

echo "  Eigene SV-Row: $sv_id"

# Angriff — verifiziert auf true patchen
response=$(curl -s -w "\n%{http_code}" \
  -X PATCH "$SUPABASE_URL/rest/v1/sachverstaendige?id=eq.$sv_id" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $access_token" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"verifiziert": true}' 2>/dev/null)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "  HTTP $http_code"

if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
  # Prüfen ob verifiziert wirklich true wurde
  verified=$(curl -s "$SUPABASE_URL/rest/v1/sachverstaendige?select=verifiziert&id=eq.$sv_id" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $access_token" 2>/dev/null \
    | (command -v jq >/dev/null && jq -r '.[0].verifiziert' || grep -o 'true\|false' | head -1))
  if [ "$verified" = "true" ]; then
    echo "  → verifiziert=true gesetzt durch SV selbst"
    echo "  ✗ ANGRIFF MOEGLICH — Privilege Escalation"
    # Aufräumen: zurücksetzen damit das Test-Konto sauber bleibt
    curl -s -X PATCH "$SUPABASE_URL/rest/v1/sachverstaendige?id=eq.$sv_id" \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "Authorization: Bearer $access_token" \
      -H "Content-Type: application/json" \
      -d '{"verifiziert": false}' >/dev/null 2>&1
    exit 1
  fi
fi

if echo "$body" | grep -q '42501\|insufficient_privilege\|"code":"42501"'; then
  echo "  → Body: 42501 / insufficient_privilege"
  echo "  ✓ ANGRIFF BLOCKIERT durch Trigger/Policy"
  exit 0
fi

echo "  → Body: $body"
echo "  ✓ ANGRIFF BLOCKIERT (HTTP $http_code, kein 42501 aber kein Erfolg)"
exit 0
