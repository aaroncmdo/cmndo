#!/usr/bin/env bash
# Smoke: flow_links anon-SELECT-Lücke (RLS-Audit #3).
#
# Angriff: Anon-User mit nur dem öffentlichen apikey dumpt Magic-Link-Token +
# Lead-IDs + Status aus der flow_links-Tabelle. Reicht aus, um Schaden-Melden-
# Flows zu hijacken oder Lead-IDs zu enumerieren.
#
# Heute (vor Migration): Anon-SELECT liefert >0 Token (ANGRIFF MOEGLICH).
# Nach Migration: Anon-SELECT liefert 0 oder 401 (ANGRIFF BLOCKIERT).

set -u

: "${SUPABASE_URL:?SUPABASE_URL muss gesetzt sein}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY muss gesetzt sein}"

echo "=== Smoke #3 — flow_links anon-SELECT ==="
echo "Target: $SUPABASE_URL"

# Mit Prefer: count=exact bekommen wir Content-Range mit total/total-count.
# Dadurch unterscheiden wir RLS-Block (401/406) von leerer Tabelle (200, 0/0).
response=$(curl -s -i "$SUPABASE_URL/rest/v1/flow_links?select=token&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Prefer: count=exact" 2>/dev/null)

http_status=$(echo "$response" | grep -i '^HTTP/' | tail -n1 | awk '{print $2}')
content_range=$(echo "$response" | grep -i '^content-range:' | tr -d '\r' | awk '{print $2}')

case "$http_status" in
  401|403|406)
    echo "  → HTTP $http_status (RLS-Block oder Auth-Fehler)"
    echo "  ✓ ANGRIFF BLOCKIERT"
    exit 0
    ;;
  200)
    # Content-Range im Format "0-4/total" — total ist Server-seitige Row-Anzahl.
    # Bei RLS-Block via Empty-Result wäre der Body [] aber Status 200 + total=0.
    if [ -z "$content_range" ]; then
      echo "  → HTTP 200 ohne Content-Range — Body-Inspektion:"
      body=$(echo "$response" | awk 'BEGIN{p=0} /^[[:space:]]*$/{p=1; next} p{print}')
      echo "$body" | head -c 200
      echo ""
      echo "  ✓ ANGRIFF BLOCKIERT oder AMBIGUOUS — kein Content-Range"
      exit 0
    fi
    total=$(echo "$content_range" | sed 's|.*/||')
    if [ "$total" = "0" ] || [ "$total" = "*" ]; then
      echo "  → HTTP 200, Tabelle hat 0 Rows (oder *) — AMBIGUOUS"
      echo "  → Smoke kann nicht zwischen 'RLS blockiert' und 'leerer Tabelle' unterscheiden."
      echo "  → Seed mit z.B. INSERT INTO flow_links (lead_id, token, kanal, …) und erneut laufen."
      exit 0
    fi
    echo "  → HTTP 200, Content-Range: $content_range (total=$total)"
    echo "  ✗ ANGRIFF MOEGLICH — Anon liest $total flow_links-Rows"
    exit 1
    ;;
  *)
    echo "  → Unerwarteter HTTP-Status: $http_status"
    echo "$response" | head -c 500
    exit 2
    ;;
esac
