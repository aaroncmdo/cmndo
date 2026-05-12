# VPS-Staging-Slot — Setup-Plan

**Datum:** 2026-05-12
**Ziel:** Eigener Staging-Build auf dem VPS, erreichbar unter `*.staging.claimondo.de`. Jeder Push auf den `staging`-Branch deployt automatisch. Smoke-Tests vor Production-Merge möglich.
**Auslöser:** PR #803 (ZB1-OCR-Field) kann ohne Preview-Deploy nicht sauber gesmoket werden.

---

## Architektur (kurz)

- **Trigger:** Push auf `staging`-Branch → GitHub Actions baut + deployt
- **Domain:** Wildcard `*.staging.claimondo.de` (z.B. `app.staging.claimondo.de`, `gutachter.staging.claimondo.de`) — Production-Subdomains (`app.claimondo.de`, `gutachter.claimondo.de`) bleiben unangetastet
- **VPS-Setup:** Zweiter PM2-Prozess `claimondo-v2-staging` auf Port **3001**, nginx-Vhost mit Wildcard-SSL davor
- **Schutz:** nginx-Basic-Auth via htpasswd
- **DB:** Shared mit Production (Claimondo-v2-Supabase) — keine eigene Staging-DB
- **Crons:** KEINE auf Staging — Crontab feuert weiterhin nur gegen Production. Gleichzeitig: `vercel.json` Crons werden komplett entfernt (waren tot, laufen schon auf VPS-Crontab)
- **Service-Worker:** Falls Feldmodus-SW in Staging Probleme macht, später per env-flag deaktivieren — out-of-scope für Setup

---

## Workflow nach Setup

```bash
# Lokal:
git checkout staging
git pull
git merge kitta/aar-backlog-zb1-ocr-field
git push origin staging

# ~5 Min warten, dann smoken auf:
# https://app.staging.claimondo.de
# Basic-Auth: Aaron + <Passwort>
```

Wenn Smoke ok → PR der ursprünglichen Feature-Branch auf `main` mergen (PR #803). `staging`-Branch bleibt liegen oder wird vor jedem neuen Test resettet (`git reset --hard origin/main` auf staging, dann frisch mergen).

---

## Aufgaben-Aufteilung

| Rolle          | Was                                                                                  |
|----------------|--------------------------------------------------------------------------------------|
| **Aaron**      | DNS-Records setzen, GitHub-Secrets ergänzen, Basic-Auth-Passwort wählen, VPS-Claude beauftragen, Smoke |
| **Lokal-Claude** (ich) | `deploy-vps-staging.yml` schreiben, `vercel.json` Crons entfernen, VPS-Handout-Doc, Memory aktualisieren |
| **VPS-Claude** (eigene Session) | DNS-Records verifizieren, htpasswd anlegen, nginx-Vhost bauen, certbot Wildcard-Cert holen, PM2-Init-Start |

---

## SCHRITT-FÜR-SCHRITT — was DU (Aaron) jetzt tun musst

### Schritt 1 (Aaron, ~5 Min): DNS-Records setzen

Bei deinem Domain-Registrar (vermutlich Cloudflare/IONOS/Strato) zwei DNS-Records anlegen:

| Typ   | Name                          | Wert              | Zweck                          |
|-------|-------------------------------|-------------------|--------------------------------|
| A     | `*.staging.claimondo.de`      | `212.132.119.110` | Wildcard für alle Subdomains   |
| A     | `staging.claimondo.de`        | `212.132.119.110` | Apex der Staging-Hierarchie (optional, aber nice für `staging.claimondo.de` Landing) |

**Wichtig:** Wenn dein Registrar **Cloudflare** ist und Proxy aktiv (orangenes Wölkchen), bei diesen Records auf "DNS only" stellen (graues Wölkchen). Cloudflare-Proxy + nginx-Basic-Auth zickt manchmal.

**Verifizieren:**
```bash
dig +short app.staging.claimondo.de
# erwartet: 212.132.119.110
```

✅ **Sag mir hier "DNS gesetzt", wenn fertig** — dann gehen wir zu Schritt 2.

---

### Schritt 2 (Aaron, ~3 Min): GitHub-Secrets ergänzen

`https://github.com/aaroncmdo/cmndo/settings/secrets/actions`

Neue Secrets:

| Name                                | Wert                                  |
|-------------------------------------|---------------------------------------|
| `NEXT_PUBLIC_APP_URL_STAGING`       | `https://app.staging.claimondo.de`    |
| `STAGING_BASIC_AUTH_USERNAME`       | z.B. `aaron`                          |
| `STAGING_BASIC_AUTH_PASSWORD`       | starkes Passwort (Bitwarden generieren) |

Username + Passwort gibst du beim Smoken im Browser ein.

✅ **Sag mir "Secrets gesetzt"**.

---

### Schritt 3 (Lokal-Claude, ich): Workflow + Cleanup-Commit

Wenn DNS + Secrets bereit sind, schreibe ich auf einem neuen Branch (`kitta/aar-staging-slot`):

1. `.github/workflows/deploy-vps-staging.yml` — analog zu Production-Workflow, aber:
   - Trigger: `branches: [staging]`
   - `NEXT_PUBLIC_APP_URL` = `NEXT_PUBLIC_APP_URL_STAGING`-Secret
   - Target: `/var/www/claimondo-v2-staging/`
   - PM2-Name: `claimondo-v2-staging`
   - PM2-Port: `3001` (über `PORT=3001` env)
2. `vercel.json` — Crons-Block komplett entfernen (laut deiner Memory eh tot, läuft auf VPS-Crontab)
3. `docs/12.05.2026/vps-staging-handout.md` — Befehls-Snippets für VPS-Claude (siehe unten zur Vorschau)
4. `staging`-Branch initialisieren: lokal `git branch staging main && git push -u origin staging`

PR gegen `main` mit diesem Setup. **Merge erst nach Schritt 4** — sonst feuert der Workflow bevor VPS bereit ist.

---

### Schritt 4 (Aaron → VPS-Claude, ~15 Min): VPS-seitiges Setup

Aaron öffnet eine VPS-Claude-Session und übergibt das Handout-Dokument. VPS-Claude führt aus:

**4a. DNS-Verifikation** (failsafe):
```bash
dig +short app.staging.claimondo.de
dig +short staging.claimondo.de
# beide müssen 212.132.119.110 returnen
```

**4b. Wildcard-SSL-Cert via DNS-Challenge:**

Wildcard-Certs erfordern DNS-Challenge (`_acme-challenge.staging.claimondo.de` TXT-Record). Zwei Wege:

- **Manuell (einmalig):** certbot fragt nach einem TXT-Record-Wert, Aaron setzt ihn beim Registrar, certbot verifiziert + holt Cert
- **Automatisch (besser für Renewal):** certbot-DNS-Plugin für deinen Provider installieren (z.B. `python3-certbot-dns-cloudflare` falls Cloudflare)

VPS-Claude entscheidet basierend auf deinem Registrar. Befehl-Skeleton:
```bash
certbot certonly --manual --preferred-challenges dns \
  -d 'staging.claimondo.de' -d '*.staging.claimondo.de' \
  --agree-tos --email aaron@claimondo.de
```

Cert landet in `/etc/letsencrypt/live/staging.claimondo.de/`.

**4c. htpasswd-File:**
```bash
apt-get install -y apache2-utils
htpasswd -bc /etc/nginx/.htpasswd-staging <USERNAME> <PASSWORD>
chmod 640 /etc/nginx/.htpasswd-staging
chown root:www-data /etc/nginx/.htpasswd-staging
```

(USERNAME / PASSWORD = die Werte aus Schritt 2.)

**4d. nginx-Vhost** unter `/etc/nginx/sites-available/staging.claimondo.de.conf`:

```nginx
# HTTP → HTTPS Redirect
server {
  listen 80;
  listen [::]:80;
  server_name *.staging.claimondo.de staging.claimondo.de;
  return 301 https://$host$request_uri;
}

# HTTPS Reverse-Proxy
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name *.staging.claimondo.de staging.claimondo.de;

  ssl_certificate     /etc/letsencrypt/live/staging.claimondo.de/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/staging.claimondo.de/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  # Bot-Schutz: Suchmaschinen sollen Staging nicht indizieren
  add_header X-Robots-Tag "noindex, nofollow" always;

  # Basic-Auth global vorgeschaltet
  auth_basic "Claimondo Staging";
  auth_basic_user_file /etc/nginx/.htpasswd-staging;

  # Body-Size für ZB1-Uploads etc. (analog Production)
  client_max_body_size 25M;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 120s;
  }
}
```

Aktivieren + reload:
```bash
ln -sf /etc/nginx/sites-available/staging.claimondo.de.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**4e. Erste PM2-Init** (vor dem ersten Deploy, damit der Prozess-Name existiert):
```bash
mkdir -p /var/www/claimondo-v2-staging
# Dummy-Datei damit pm2 nicht crasht
echo 'console.log("staging placeholder")' > /var/www/claimondo-v2-staging/server.js
PORT=3001 pm2 start /var/www/claimondo-v2-staging/server.js \
  --name claimondo-v2-staging \
  --env production \
  --max-memory-restart 1400M
pm2 save
```

Nach dem ersten echten Deploy übernimmt der Workflow.

✅ **VPS-Claude meldet zurück "Staging-Slot bereit"**. Aaron verifiziert mit:
```bash
curl -k -u <USERNAME>:<PASSWORD> https://app.staging.claimondo.de
# erwartet: HTML der Placeholder-Datei oder 502 (Next-Server läuft noch nicht)
```

---

### Schritt 5 (Aaron, ~2 Min): PR mergen + ersten Deploy triggern

PR von `kitta/aar-staging-slot` auf `main` mergen. Dann:

```bash
git checkout main && git pull
git checkout -b staging
git push -u origin staging
```

GitHub Actions feuert `deploy-vps-staging.yml`. Nach ~5 Min:
```
https://app.staging.claimondo.de → Basic-Auth → echte App
```

✅ **Smoke-Test PR #803:**
```bash
git checkout staging
git merge kitta/aar-backlog-zb1-ocr-field
git push origin staging
# warten, dann ZB1-Wizard auf Mobile testen
```

---

## Datei-Manifest (was ich schreibe)

- `.github/workflows/deploy-vps-staging.yml` — Workflow
- `vercel.json` — Crons-Block entfernt
- `docs/12.05.2026/vps-staging-handout.md` — VPS-Claude-Briefing (extrahiert aus diesem Plan, fokussiert auf Schritt 4)

Memory-Update nach Setup:
- `staging_slot.md` — neue Memory: Workflow + DNS + Secrets-Namen + Smoke-Pfad

---

## Edge-Cases & Risiken (Recap)

- **Shared-DB:** Staging-Bugs können Production-Daten betreffen. Akzeptiert (Aaron solo).
- **Magic-Links:** Müssen auf staging zurückführen — gelöst via `NEXT_PUBLIC_APP_URL_STAGING`.
- **Build-Race:** GitHub-Actions queued, kein Race auf VPS.
- **Port 3001:** Sollte frei sein. VPS-Claude verifiziert mit `ss -tlnp | grep 3001`.
- **Cert-Renewal:** Wildcard via DNS-Challenge ist nicht auto-renewable ohne DNS-Plugin. Wenn nur manueller Challenge gewählt: Cron-Reminder in 80 Tagen einplanen, dann manuell renewen.

---

## Out-of-Scope

- Eigene Staging-Supabase
- Staging-Banner im UI (rotes "STAGING"-Label)
- Pro-PR-Subdomain-Slots (`pr-803.staging.claimondo.de`) — beim Erweitern später machbar
- Auto-Reset von `staging`-Branch auf `main` nach jedem Merge — manueller `git reset --hard` reicht

---

**Was DU jetzt tust:**

1. Lies diesen Plan
2. Setze DNS-Records (Schritt 1) — sag mir "DNS gesetzt"
3. Setze GitHub-Secrets (Schritt 2) — sag mir "Secrets gesetzt"
4. Ich baue dann den Workflow + Handout (Schritt 3) und stelle Branch
5. Du übergibst dem VPS-Claude das Handout (Schritt 4)
6. Mergen + ersten Push auf staging (Schritt 5) → fertig
