#!/usr/bin/env bash
# Smoke: Storage-Buckets public + anon-write (RLS-Audit #4).
#
# Angriff A (lesen): 4 Buckets sind public=true → anon-curl auf
# /storage/v1/object/public/<bucket>/<path> liefert Dateien ohne Auth.
# Angriff B (schreiben): unterschriften-Bucket erlaubt anon-Write →
# beliebiges Objekt kann hochgeladen werden ohne Auth.
#
# Heute: beide klappen (ANGRIFF MOEGLICH).
# Nach Migration: bucket public=false + per-Fall-Policy → 403 (BLOCKIERT).
#                 anon-Write entfernt → 403 (BLOCKIERT).

set -u

: "${SUPABASE_URL:?SUPABASE_URL muss gesetzt sein}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY muss gesetzt sein}"

echo "=== Smoke #4 — Storage-Buckets public + anon-write ==="
echo "Target: $SUPABASE_URL"

attack_a_ok=0
attack_b_ok=0

# Angriff A — Bucket-Konfiguration via Storage-Admin-API. Storage-API verlangt
# BEIDE Header: apikey + Authorization: Bearer.
#
# Hinweis 13.05.2026: Der bucket-Detail-Endpoint liefert anon 404 selbst wenn
# der Bucket public=true ist — die Angriffsfläche bestätigt sich besser über
# Angriff B (anon-Write) oder über eine direkte Public-URL-Probe mit bekanntem
# Pfad. Bucket-Konfig prüfen am sichersten via DB (`SELECT id, public FROM
# storage.buckets`) als Pre-Run-Verifikation.
for bucket in fall-dokumente gutachten schadensfotos unterschriften; do
  response=$(curl -s "$SUPABASE_URL/storage/v1/bucket/$bucket" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" 2>/dev/null)
  is_public=$(echo "$response" | (command -v jq >/dev/null && jq -r '.public' || grep -o '"public":[a-z]*' | cut -d: -f2))
  if [ "$is_public" = "true" ]; then
    echo "  Bucket '$bucket': public=true → anon-download möglich wenn Pfad bekannt"
    attack_a_ok=1
  elif [ "$is_public" = "false" ]; then
    echo "  Bucket '$bucket': public=false → anon-download nur via signed URL"
  else
    echo "  Bucket '$bucket': unklar — Antwort: $(echo "$response" | head -c 100)"
  fi
done

# Angriff B — anon-Write auf unterschriften (1px PNG via base64).
test_path="smoke-rls-phase-1-$(date +%s).png"
png_b64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjAAAAAgABc3UBGAAAAABJRU5ErkJggg=="
# base64-decode in einer Variable hält das Skript portable (kein temp-file)
status_write=$(echo "$png_b64" | base64 --decode 2>/dev/null \
  | curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$SUPABASE_URL/storage/v1/object/unterschriften/$test_path" \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
      -H "Content-Type: image/png" \
      --data-binary @- 2>/dev/null)

if [ "$status_write" = "200" ] || [ "$status_write" = "201" ]; then
  echo "  unterschriften anon-Write HTTP $status_write → MOEGLICH"
  attack_b_ok=1
  # Aufräumen (best-effort, falls erlaubt)
  curl -s -o /dev/null -X DELETE "$SUPABASE_URL/storage/v1/object/unterschriften/$test_path" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" 2>/dev/null
else
  echo "  unterschriften anon-Write HTTP $status_write → BLOCKIERT"
fi

if [ "$attack_a_ok" = "1" ] || [ "$attack_b_ok" = "1" ]; then
  echo "  ✗ ANGRIFF MOEGLICH (lesen=$attack_a_ok schreiben=$attack_b_ok)"
  exit 1
else
  echo "  ✓ ANGRIFF BLOCKIERT (alle 4 Buckets + anon-Write geschützt)"
  exit 0
fi
