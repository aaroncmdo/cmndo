# One-Shot VPS-Befehl — schaden.claimondo.de → 301 Hauptdomain

**Stand:** 14.05.2026 · Aaron-Action: SSH einloggen + Block kopieren + Enter

## So gehst du vor

```bash
# 1. SSH auf VPS
ssh aaron@212.132.119.110   # oder dein Standard-User

# 2. Den ganzen Block unten in EINEM Stück ins Terminal pasten + Enter
# 3. Wenn am Ende "✓ ALLES GUT" steht: fertig
#    Wenn ein Fehler kommt: Rollback ist im Block, alles bleibt wie vorher
```

---

## Der One-Shot-Block (komplett kopieren, ins SSH-Terminal pasten)

```bash
# ═══════════════════════════════════════════════════════════════════════
# schaden.claimondo.de — WordPress → nginx-301-Redirect-Subdomain
# Generiert von Claude · 14.05.2026
# ═══════════════════════════════════════════════════════════════════════

set -e  # Bei Fehler sofort stoppen

# ----- 0. Detect old config file -----
OLD_CONF=""
for f in /etc/nginx/sites-enabled/schaden.claimondo.de.conf \
         /etc/nginx/sites-enabled/schaden.claimondo.de \
         /etc/nginx/sites-available/schaden.claimondo.de.conf \
         /etc/nginx/sites-available/schaden.claimondo.de; do
  if [ -f "$f" ]; then OLD_CONF="$f"; break; fi
done
if [ -z "$OLD_CONF" ]; then
  echo "✗ Keine schaden.claimondo.de nginx-Konfig gefunden — Abbruch."
  exit 1
fi
echo "→ Alte Konfig: $OLD_CONF"

# ----- 1. SSL-Cert-Pfad ermitteln -----
SSL_CERT=$(sudo certbot certificates 2>/dev/null | grep -A 3 "schaden.claimondo.de" | grep "Certificate Path:" | head -1 | awk '{print $3}')
SSL_KEY=$(sudo certbot certificates 2>/dev/null | grep -A 4 "schaden.claimondo.de" | grep "Private Key Path:" | head -1 | awk '{print $4}')
if [ -z "$SSL_CERT" ] || [ -z "$SSL_KEY" ]; then
  # Fallback: Standard-Pfade
  SSL_CERT="/etc/letsencrypt/live/schaden.claimondo.de/fullchain.pem"
  SSL_KEY="/etc/letsencrypt/live/schaden.claimondo.de/privkey.pem"
fi
if [ ! -f "$SSL_CERT" ]; then
  echo "✗ SSL-Cert nicht gefunden ($SSL_CERT) — Abbruch."
  exit 1
fi
echo "→ SSL-Cert: $SSL_CERT"

# ----- 2. Backup der alten Konfig -----
BACKUP="${OLD_CONF}.backup-$(date +%Y%m%d-%H%M%S)"
sudo cp "$OLD_CONF" "$BACKUP"
echo "→ Backup: $BACKUP"

# ----- 3. Neue Redirect-Konfig schreiben -----
TARGET_AVAILABLE="/etc/nginx/sites-available/schaden.claimondo.de.conf"
sudo tee "$TARGET_AVAILABLE" > /dev/null <<NGINX_EOF
# 14.05.2026: schaden.claimondo.de stillgelegt — alle Pfade 301 auf claimondo.de.
# Vorher: WordPress mit Yoast-SEO, ~6 Pages, Duplicate-Content zur Hauptdomain.
# Doku: docs/13.05.2026/marketing-rework/INDEXIERUNG-SUBDOMAINS.md

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name schaden.claimondo.de;

    ssl_certificate     ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};

    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Explizite Mappings für die alten WordPress-Page-Slugs
    location = /kontakt/             { return 301 https://claimondo.de/ueber-uns; }
    location = /kontakt              { return 301 https://claimondo.de/ueber-uns; }
    location = /impressum/           { return 301 https://claimondo.de/impressum; }
    location = /impressum            { return 301 https://claimondo.de/impressum; }
    location = /datenschutzerklaerung/ { return 301 https://claimondo.de/datenschutz; }
    location = /datenschutzerklaerung  { return 301 https://claimondo.de/datenschutz; }
    location = /styleguide/          { return 301 https://claimondo.de/; }
    location = /styleguide           { return 301 https://claimondo.de/; }
    location = /vielen-dank/         { return 301 https://claimondo.de/; }
    location = /vielen-dank          { return 301 https://claimondo.de/; }
    location = /vielen-dank-duplikat/ { return 301 https://claimondo.de/; }
    location = /vielen-dank-duplikat  { return 301 https://claimondo.de/; }

    # Yoast-Sitemaps + Crawl-Pfade
    location = /sitemap.xml          { return 301 https://claimondo.de/sitemap.xml; }
    location = /sitemap_index.xml    { return 301 https://claimondo.de/sitemap.xml; }
    location = /page-sitemap.xml     { return 301 https://claimondo.de/sitemap.xml; }
    location ~ ^/.*-sitemap[0-9]*\.xml\$ { return 301 https://claimondo.de/sitemap.xml; }
    location = /robots.txt           { return 301 https://claimondo.de/robots.txt; }

    # WordPress-Crawler-Pfade → 410 Gone (Google deindexed aktiv)
    location ~ ^/wp-(admin|login|content|includes|json) { return 410; }
    location = /xmlrpc.php           { return 410; }

    # Root → /schaden-melden (semantisch nächste Page)
    location = / { return 301 https://claimondo.de/schaden-melden; }

    # Catch-all pfaderhaltend
    location / { return 301 https://claimondo.de\$request_uri; }

    access_log /var/log/nginx/schaden.claimondo.de.redirect.access.log;
    error_log  /var/log/nginx/schaden.claimondo.de.redirect.error.log warn;
}

# HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name schaden.claimondo.de;
    return 301 https://schaden.claimondo.de\$request_uri;
}
NGINX_EOF

# ----- 4. Symlink falls noch nicht in sites-enabled -----
TARGET_ENABLED="/etc/nginx/sites-enabled/schaden.claimondo.de.conf"
if [ ! -L "$TARGET_ENABLED" ] && [ ! -e "$TARGET_ENABLED" ]; then
  sudo ln -s "$TARGET_AVAILABLE" "$TARGET_ENABLED"
  echo "→ Symlink angelegt: $TARGET_ENABLED"
fi

# Wenn alte Datei direkt in sites-enabled lag (kein symlink), ersetzen
if [ -f "$OLD_CONF" ] && [ "$OLD_CONF" != "$TARGET_AVAILABLE" ] && [ "$OLD_CONF" != "$TARGET_ENABLED" ]; then
  sudo cp "$TARGET_AVAILABLE" "$OLD_CONF"
  echo "→ Alte Konfig-Stelle überschrieben: $OLD_CONF"
fi

# ----- 5. Validate -----
echo ""
echo "→ Teste nginx-Konfig …"
if ! sudo nginx -t 2>&1; then
  echo ""
  echo "✗ nginx -t FEHLGESCHLAGEN — Rollback wird ausgeführt"
  sudo cp "$BACKUP" "$OLD_CONF"
  sudo rm -f "$TARGET_AVAILABLE"
  sudo rm -f "$TARGET_ENABLED" 2>/dev/null || true
  echo "→ Rollback durch. Server unverändert. Schick mir den Output oben + ich passe an."
  exit 1
fi

# ----- 6. Reload -----
sudo systemctl reload nginx
echo "→ nginx reloaded"

# ----- 7. Smoke-Test -----
echo ""
echo "→ Smoke-Test:"
PASS=0
FAIL=0
for path in "/" "/kontakt/" "/impressum/" "/datenschutzerklaerung/" "/sitemap.xml" "/wp-admin/" "/beliebiger-pfad" "/kfz-gutachter/koeln"; do
  HTTP=$(curl -sI "https://schaden.claimondo.de${path}" 2>/dev/null | head -1 | awk '{print \$2}')
  LOC=$(curl -sI "https://schaden.claimondo.de${path}" 2>/dev/null | grep -i "^location:" | awk '{print \$2}' | tr -d '\r')
  case "$path" in
    "/wp-admin/")
      if [ "$HTTP" = "410" ]; then echo "  ✓ $path → 410 Gone"; PASS=\$((PASS+1)); else echo "  ✗ $path → $HTTP (erwartet 410)"; FAIL=\$((FAIL+1)); fi ;;
    *)
      if [ "$HTTP" = "301" ] && [[ "$LOC" == https://claimondo.de* ]]; then
        echo "  ✓ $path → 301 → $LOC"; PASS=\$((PASS+1))
      else
        echo "  ✗ $path → $HTTP $LOC"; FAIL=\$((FAIL+1))
      fi ;;
  esac
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "═══════════════════════════════════════════════════════"
  echo "✓ ALLES GUT — $PASS/8 Smoke-Tests bestanden."
  echo "  schaden.claimondo.de stillgelegt + 301-Redirect aktiv."
  echo "  Backup unter: $BACKUP"
  echo "═══════════════════════════════════════════════════════"
else
  echo "⚠ $FAIL Smoke-Test(s) fehlgeschlagen — schick mir den Output oben."
fi
```

---

## Wenn am Ende „✓ ALLES GUT" steht

Schreib mir nur: **„schaden ist durch"** — ich pflege die Doku nach + hake
in der Indexierungs-Anleitung den Punkt ab.

## Wenn ein Fehler kommt

Schick mir die letzten 20 Zeilen vom Output (ab dem ersten ✗). Der Rollback
ist automatisch — der Server läuft weiter wie vorher. Ich passe die Konfig
an und gebe dir einen neuen One-Shot-Block.

---

## Optional: gleicher Pattern für `kfzgutachter.claimondo.de/` Root

Wenn schaden durch ist, ist der nächste Quick-Win der Root-Redirect für
`kfzgutachter.claimondo.de`. Aktuell zeigt der noch auf `/kfz-gutachter-koeln`
(altes Maik-Ads-Mapping), sollte aber auf `/` zeigen. Such die Stelle in
`/etc/nginx/sites-enabled/kfzgutachter*` und ändere das `return 301`-Ziel,
oder lass den ganzen Block weg — dann fängt mein Next.js-Proxy den Root ab.

Sag „nächste runde" wenn du da bist — dann generiere ich denselben One-Shot-
Block für diese Subdomain.
