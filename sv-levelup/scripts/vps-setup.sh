#!/usr/bin/env bash
#
# Richtet sv-levelup.claimondo.de auf dem VPS ein — NGINX-Site + Zertifikat.
#
# Aufruf auf dem VPS als root:
#     bash vps-setup.sh
#
# ⚠ VORAUSSETZUNG, die dieses Skript NICHT erfuellen kann:
# Der A-Record von sv-levelup.claimondo.de muss auf 212.132.119.110 zeigen.
# Gemessen am 20.08.2026 zeigte er auf 217.160.0.101 — die Parkadresse von
# IONOS. Die Subdomain EXISTIERT also (kein Wildcard: eine erfundene Subdomain
# gibt NXDOMAIN), aber sie zeigt an die falsche Stelle. Das Skript prueft das
# und bricht ab, statt ein Zertifikat anzufordern, das ohnehin scheitern wuerde.
#
# Reihenfolge insgesamt:
#   1. A-Record bei IONOS auf 212.132.119.110   ← nur Aaron
#   2. Branch nach main mergen → Deploy-Workflow legt /var/www/sv-levelup an
#      und startet pm2 auf :3009
#   3. dieses Skript
#
# Idempotent: mehrfaches Ausfuehren aendert nichts, was schon steht.

set -euo pipefail

DOMAIN="sv-levelup.claimondo.de"
PORT=3009
VPS_IP="212.132.119.110"

echo "── 1 · DNS pruefen"
AUFGELOEST=$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)
if [ "$AUFGELOEST" != "$VPS_IP" ]; then
  echo "   ABBRUCH: $DOMAIN zeigt auf ${AUFGELOEST:-nichts}, erwartet $VPS_IP."
  echo "   Ein Zertifikat liesse sich so nicht ausstellen — Let's Encrypt prueft"
  echo "   ueber genau diesen Namen. Erst den A-Record umstellen."
  exit 1
fi
echo "   $DOMAIN → $AUFGELOEST ✓"

echo "── 2 · Laeuft die Anwendung auf :$PORT?"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://127.0.0.1:$PORT/" || echo "000")
if [ "$CODE" != "200" ]; then
  echo "   ABBRUCH: :$PORT antwortet mit $CODE."
  echo "   Eine NGINX-Site auf einen toten Port liefert 502 — erst deployen"
  echo "   (Branch nach main mergen, der Workflow erledigt den Rest)."
  exit 1
fi
echo "   :$PORT → HTTP 200 ✓"

echo "── 3 · NGINX-Site schreiben"
# Zuerst NUR HTTP. certbot ergaenzt den 443-Block und die Weiterleitung selbst —
# so steht die Zertifikatsverwaltung an einer Stelle (wie bei den uebrigen
# Subdomains, deren Bloecke „managed by Certbot" tragen).
cat > "/etc/nginx/sites-available/$DOMAIN" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        client_max_body_size 20M;
    }
}
NGINX
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
echo "   geschrieben und verlinkt ✓"

echo "── 4 · Konfiguration testen VOR dem Neuladen"
# ⚠ Ein `reload` mit fehlerhafter Konfiguration nimmt ALLE Sites mit — auch
# app.claimondo.de. Deshalb erst pruefen, und bei Fehler die neue Site sofort
# wieder aushaengen.
if ! nginx -t 2>&1; then
  echo "   ABBRUCH: Konfiguration fehlerhaft — Site wieder ausgehaengt."
  rm -f "/etc/nginx/sites-enabled/$DOMAIN"
  exit 1
fi
systemctl reload nginx
echo "   NGINX neu geladen ✓"

echo "── 5 · Zertifikat"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "   Zertifikat besteht bereits — uebersprungen."
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --redirect -m aaron.sprafke@claimondo.de
  echo "   ausgestellt ✓"
fi

echo "── 6 · Nachweis von aussen"
for pfad in "/" "/anmelden" "/auswertung"; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://$DOMAIN$pfad" || echo "000")
  echo "   $pfad → HTTP $c"
done
echo ""
echo "   ⚠ /auswertung MUSS 307 liefern. Eine 200 hiesse, dass der"
echo "     Gespraechsleitfaden samt Einwandbehandlung ohne Anmeldung abrufbar"
echo "     ist — dann sofort die Site wieder aushaengen."
