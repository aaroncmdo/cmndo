# VPS-Aufgabe: schaden.claimondo.de → 301 auf Hauptdomain

**Stand:** 14.05.2026
**Ziel:** Legacy-Subdomain `schaden.claimondo.de` komplett vom VPS auflösen
und alle Pfade pfaderhaltend per 301 auf `claimondo.de` umleiten. Damit
verschwindet die WordPress-Installation aus dem Index, externer Backlink-
Wert konsolidiert sich auf der Hauptdomain.

**Ausführer:** Aaron (per SSH auf VPS 212.132.119.110)

---

## 1 · Vorab: Ist-Zustand prüfen

```bash
ssh aaron@212.132.119.110
# oder über deinen Standard-User
ls /etc/nginx/sites-enabled/ | grep -i schaden
sudo cat /etc/nginx/sites-enabled/schaden.claimondo.de* 2>/dev/null | head -40
```

Erwartung: Es existiert eine Datei wie
`schaden.claimondo.de.conf` mit einem `server`-Block der auf WordPress
(php-fpm via `fastcgi_pass`) zeigt.

---

## 2 · Backup der aktuellen Konfig

```bash
sudo cp /etc/nginx/sites-enabled/schaden.claimondo.de.conf \
        /etc/nginx/sites-enabled/schaden.claimondo.de.conf.backup-$(date +%Y%m%d)
sudo cp /etc/nginx/sites-available/schaden.claimondo.de.conf \
        /etc/nginx/sites-available/schaden.claimondo.de.conf.backup-$(date +%Y%m%d) 2>/dev/null || true
```

Falls die Datei anders heißt: Pfad in den Befehlen anpassen.

---

## 3 · Neue nginx-Konfig — pfaderhaltender 301-Redirect

Datei ersetzen mit:

```bash
sudo tee /etc/nginx/sites-available/schaden.claimondo.de.conf > /dev/null <<'EOF'
# 14.05.2026: schaden.claimondo.de stillgelegt.
# Vorher: WordPress mit Yoast-SEO, ~6 Pages, thematisch Duplicate-Content
# zur Hauptdomain (siehe docs/13.05.2026/marketing-rework/INDEXIERUNG-SUBDOMAINS.md).
# Jetzt: alle Pfade 301 pfaderhaltend auf claimondo.de, plus explizite
# Mappings für die alten WordPress-Page-Slugs.

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name schaden.claimondo.de;

    # SSL — gleiche Zertifikate weiter nutzen, brauchen sowieso nicht erneuert
    # zu werden für eine reine Redirect-Subdomain.
    # PFAD-PRÜFUNG: vor Apply mit `sudo certbot certificates | grep schaden` ob diese Pfade stimmen.
    ssl_certificate     /etc/letsencrypt/live/schaden.claimondo.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/schaden.claimondo.de/privkey.pem;

    # Security-Header für die Redirect-Antwort (analog Hauptdomain).
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Explizite Mappings für die alten WordPress-Slugs → semantisch passende
    # Hauptdomain-Pages. Reihenfolge wichtig: spezifischer vor generisch.
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

    # WordPress-Crawl-Pfade ins Nichts — verhindert Index-Spuren.
    location = /sitemap.xml          { return 301 https://claimondo.de/sitemap.xml; }
    location = /sitemap_index.xml    { return 301 https://claimondo.de/sitemap.xml; }
    location = /page-sitemap.xml     { return 301 https://claimondo.de/sitemap.xml; }
    location ~ ^/.*-sitemap[0-9]*\.xml$ { return 301 https://claimondo.de/sitemap.xml; }
    location = /robots.txt           { return 301 https://claimondo.de/robots.txt; }
    location ~ ^/wp-(admin|login|content|includes|json) { return 410; }
    location = /xmlrpc.php           { return 410; }

    # Root + alles andere → /schaden-melden (semantisch nächste Page auf Hauptdomain).
    location = / {
        return 301 https://claimondo.de/schaden-melden;
    }

    # Catch-all — pfaderhaltend zur Hauptdomain.
    # Beispiel: schaden.claimondo.de/foo/bar → claimondo.de/foo/bar
    # Falls die Hauptdomain den Pfad nicht kennt, liefert sie ihre normale 404.
    location / {
        return 301 https://claimondo.de$request_uri;
    }

    access_log /var/log/nginx/schaden.claimondo.de.redirect.access.log;
    error_log  /var/log/nginx/schaden.claimondo.de.redirect.error.log warn;
}

# HTTP → HTTPS-Redirect für Legacy-Bookmarks ohne https://
server {
    listen 80;
    listen [::]:80;
    server_name schaden.claimondo.de;
    return 301 https://schaden.claimondo.de$request_uri;
}
EOF
```

---

## 4 · Validieren + Reload

```bash
sudo nginx -t
# Erwartung: "syntax is ok" + "test is successful"

sudo systemctl reload nginx
```

Falls `nginx -t` einen Fehler zeigt (häufigster: SSL-Cert-Pfad stimmt nicht):
- Mit `sudo certbot certificates` die echten Cert-Pfade abfragen
- Pfad in der `.conf` korrigieren
- Erneut `sudo nginx -t`

---

## 5 · Smoke-Test direkt auf dem VPS

```bash
# Erwartung: 301 + Location-Header auf claimondo.de
curl -sI https://schaden.claimondo.de/                          | head -3
curl -sI https://schaden.claimondo.de/kontakt/                  | head -3
curl -sI https://schaden.claimondo.de/impressum/                | head -3
curl -sI https://schaden.claimondo.de/datenschutzerklaerung/    | head -3
curl -sI https://schaden.claimondo.de/sitemap_index.xml         | head -3
curl -sI https://schaden.claimondo.de/wp-admin/                 | head -3   # erwartet 410
curl -sI https://schaden.claimondo.de/beliebiger-pfad           | head -3   # erwartet 301 → claimondo.de/beliebiger-pfad
```

Wenn alle 301 bzw. 410 liefern: **Erfolg**. Schreib mir kurz „schaden-Redirect läuft",
dann pflege ich die Anleitungs-Doc nach.

---

## 6 · WordPress-Stack abschalten (optional, später)

Wenn die Redirects 1 Woche stabil laufen + GSC zeigt dass alle 6 Pages aus
dem Index sind:

```bash
# PHP-FPM-Pool für WordPress stoppen (falls eigener Pool):
sudo systemctl stop php-fpm@schaden  # oder analog

# Wordpress-Verzeichnis archivieren (nicht löschen — falls Rollback nötig)
sudo tar -czf /root/backups/schaden-claimondo-wordpress-$(date +%Y%m%d).tar.gz \
            /var/www/schaden.claimondo.de
sudo mv /var/www/schaden.claimondo.de /var/www/schaden.claimondo.de.archived

# MySQL-Datenbank dumpen, dann droppen (falls eigene DB für WordPress)
sudo mysqldump <wp_db_name> > /root/backups/schaden-claimondo-wp-db-$(date +%Y%m%d).sql
sudo mysql -e "DROP DATABASE <wp_db_name>;"
```

Spart Hosting-Resourcen + entfernt eine Wartungs-Surface (kein WordPress-
Security-Patching mehr nötig).

---

## 7 · GSC-Aktion nach Aktivierung

1. GSC → Property `schaden.claimondo.de` öffnen
2. **URL-Inspection** für jede der 6 alten Pages → „Live URL prüfen" → siehst du 301?
3. **Coverage-Report** beobachten — innerhalb 4 Wochen sollten alle Pages
   von „Indexed" auf „Page with redirect (404 with redirect)" wechseln
4. **Property kann später gelöscht werden** sobald GSC keine indexierten URLs
   mehr meldet

---

## 8 · Falls etwas schiefgeht — Rollback

```bash
# Backup wiederherstellen
sudo cp /etc/nginx/sites-enabled/schaden.claimondo.de.conf.backup-YYYYMMDD \
        /etc/nginx/sites-enabled/schaden.claimondo.de.conf
sudo nginx -t && sudo systemctl reload nginx
```

WordPress läuft dann wieder weil die alte Konfig auf `fastcgi_pass` zu php-fpm
zeigt — Datenbank + Files sind nicht angefasst.

---

## 9 · Bonus: Gleicher Pattern für kfzgutachter.claimondo.de Root

Wir haben vorhin festgestellt dass `kfzgutachter.claimondo.de/` per nginx
zu `claimondo.de/kfz-gutachter-koeln` redirected wird (mein Code in
proxy.ts greift für alle anderen Pfade, aber nicht für Root). Das ist
falsch — der semantisch korrekte Redirect wäre auf die Hauptdomain-Root
oder auf `/kfz-gutachter`.

Falls du das mit fixen willst, schau im nginx-Konfig-Verzeichnis:

```bash
sudo grep -l "kfzgutachter" /etc/nginx/sites-enabled/*
# Wenn eine Datei matched, die Zeile mit "return 301" finden + ändern auf:
#   return 301 https://claimondo.de/;
# oder einfach komplett rauslöschen — dann fängt mein proxy.ts den Pfad
# automatisch ab und redirected pfaderhaltend.
```

Auch hier `sudo nginx -t && sudo systemctl reload nginx` zum Apply.

---

**Wenn du Hilfe brauchst:** schick mir Output von `sudo nginx -t` oder die
aktuelle `schaden.claimondo.de.conf`-Datei — ich passe die Konfig an.
