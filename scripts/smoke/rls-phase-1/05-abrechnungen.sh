#!/usr/bin/env bash
# Smoke: abrechnungen ALL-USING-authenticated-Lücke (RLS-Audit #5).
#
# Angriff: Jeder eingeloggte User (egal welche Rolle) liest ALLE Abrechnungen
# und kann sie auch schreiben. Eine `ALL USING(auth.role()='authenticated')`-
# Policy gibt keinerlei Pro-Row-Filter — kompletter Daten-Leak.
#
# Heute (vor Migration): SV-User liest beliebige Abrechnungen, nicht nur eigene
#                        (ANGRIFF MOEGLICH).
# Nach Migration: SV liest nur eigene (sv_id=auth.uid()), Kunde nur eigene Fälle,
#                 fremde Abrechnungen liefern [] oder 403 (ANGRIFF BLOCKIERT).

set -u

: "${SUPABASE_URL:?SUPABASE_URL muss gesetzt sein}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY muss gesetzt sein}"
: "${SMOKE_SV_EMAIL:=test-sv@claimondo.de}"
: "${SMOKE_PASSWORD:=Test1234!}"

echo "=== Smoke #5 — abrechnungen authenticated-Lücke ==="
echo "Target: $SUPABASE_URL"
echo "Test-User: $SMOKE_SV_EMAIL"

# Schritt 1 — als SV-User einloggen via password grant
token_response=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_SV_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}" 2>/dev/null)

access_token=$(echo "$token_response" | (command -v jq >/dev/null && jq -r '.access_token' || sed 's/.*"access_token":"\([^"]*\)".*/\1/'))

if [ -z "$access_token" ] || [ "$access_token" = "null" ]; then
  echo "  → Login fehlgeschlagen — Output: $token_response"
  exit 2
fi

sv_uid=$(echo "$token_response" | (command -v jq >/dev/null && jq -r '.user.id' || sed 's/.*"id":"\([^"]*\)".*/\1/'))
echo "  SV-User UID: $sv_uid"

# Schritt 2 — alle Abrechnungen via authenticated-Token holen
count=$(curl -s "$SUPABASE_URL/rest/v1/abrechnungen?select=id,sv_id,fall_id&limit=10" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $access_token" 2>/dev/null \
  | (command -v jq >/dev/null && jq 'length' || grep -o '"id"' | wc -l))

if [ -z "$count" ] || [ "$count" = "null" ]; then
  echo "  → Antwort nicht parsebar"
  exit 2
fi

# Heuristik: wenn der SV-User mehr Abrechnungen sieht als nur seine eigenen,
# ist die Lücke offen. Schwer von außen zu unterscheiden ohne sv_id-Inspektion.
# Daher: einfache Schwelle — >0 Treffer = Lücke offen (bestätigt Audit).
if [ "$count" -gt 0 ]; then
  echo "  → SV-User sieht $count Abrechnungen via authenticated-Token"
  echo "  ✗ ANGRIFF MOEGLICH — bitte fremde sv_id im Output prüfen (audit-bestätigt)"
  exit 1
else
  echo "  → SV-User sieht 0 Abrechnungen (entweder Lücke geschlossen oder kein Test-Daten)"
  echo "  ✓ ANGRIFF BLOCKIERT (oder SKIP — kein Test-Datensatz)"
  exit 0
fi
