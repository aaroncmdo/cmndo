# VPS-Staging-Slot — Handout für VPS-Claude

**Auftrag:** Staging-Slot auf dem VPS einrichten, sodass GitHub Actions automatisch deployt sobald jemand auf den `staging`-Branch pusht.

**Server:** `212.132.119.110` (root-Zugang via SSH-Key)
**Domain:** Wildcard `*.staging.claimondo.de` (DNS-A-Records sind bereits gesetzt durch Aaron — bitte verifizieren)
**Port:** PM2-Prozess `claimondo-v2-staging` auf **3001** (Production läuft auf 3000)
**Schutz:** Basic-Auth via htpasswd vor nginx-Proxy

---

## Aufgaben (in dieser Reihenfolge)

### 1. Sanity-Checks

```bash
# DNS auflöst zu unserer VPS-IP?
dig +short app.staging.claimondo.de
dig +short staging.claimondo.de
# erwartet: 212.132.119.110

# Port 3001 frei?
ss -tlnp | grep ':3001 ' || echo "Port 3001 frei"

# Production unangetastet?
pm2 list | grep claimondo-v2
# erwartet: ein Prozess "claimondo-v2" online auf Port 3000
```

Wenn DNS noch falsch propagiert: warten und nochmal prüfen. Wenn Port 3001 belegt: Aaron fragen, ggf. anderen Port (3002, 3003) wählen — dann auch im nginx-Vhost (`proxy_pass`) und im GitHub-Workflow (`PORT=3001`) ändern.

### 2. Basic-Auth htpasswd-File

Aaron hat ein Basic-Auth-Username + -Passwort gewählt und in GitHub-Secrets gespeichert:
- `STAGING_BASIC_AUTH_USERNAME` (z.B. `aaron`)
- `STAGING_BASIC_AUTH_PASSWORD` (starkes Passwort aus Bitwarden)

Frag Aaron nach diesen Werten (lese sie NICHT aus GitHub aus — er gibt sie dir interaktiv).

```bash
apt-get install -y apache2-utils
htpasswd -bc /etc/nginx/.htpasswd-staging '<USERNAME>' '<PASSWORD>'
chmod 640 /etc/nginx/.htpasswd-staging
chown root:www-data /etc/nginx/.htpasswd-staging

# Verifikation
cat /etc/nginx/.htpasswd-staging
# erwartet: aaron:$apr1$...
```

### 3. Wildcard-SSL-Cert via Let's Encrypt (DNS-Challenge)

Wildcard-Certs erfordern DNS-Challenge. Es gibt zwei Wege — wähle basierend auf Aarons Registrar:

#### 3a. Manueller Challenge (universell, aber alle 60 Tage manuell renewen)

```bash
certbot certonly --manual --preferred-challenges dns \
  -d 'staging.claimondo.de' -d '*.staging.claimondo.de' \
  --agree-tos --email aaron@claimondo.de \
  --no-eff-email
```

certbot zeigt: "Please deploy a DNS TXT record under the name: `_acme-challenge.staging.claimondo.de` with the following value: `<wert>`".

Aaron setzt diesen TXT-Record bei seinem Registrar. Mit `dig +short TXT _acme-challenge.staging.claimondo.de` verifizieren bevor man bei certbot ENTER drückt. Dann ENTER — certbot holt das Cert.

#### 3b. Automatischer Challenge (besser für Renewal, falls Registrar Plugin hat)

Bei Cloudflare:
```bash
apt-get install -y python3-certbot-dns-cloudflare
# Aaron erstellt einen API-Token mit Zone:DNS:Edit auf der claimondo.de-Zone,
# legt ihn in /root/.secrets/cloudflare.ini ab:
#   dns_cloudflare_api_token = <token>
chmod 600 /root/.secrets/cloudflare.ini

certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d 'staging.claimondo.de' -d '*.staging.claimondo.de' \
  --agree-tos --email aaron@claimondo.de --no-eff-email
```

Bei anderen Providern (IONOS, Strato, Hetzner DNS) entsprechende `python3-certbot-dns-<provider>` Plugins prüfen.

#### 3c. Cert verifizieren

```bash
ls -la /etc/letsencrypt/live/staging.claimondo.de/
# erwartet: fullchain.pem, privkey.pem, chain.pem, cert.pem
```

### 4. nginx-Vhost

Erstelle `/etc/nginx/sites-available/staging.claimondo.de.conf`:

```nginx
# HTTP → HTTPS Redirect für alle Staging-Subdomains
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
  ssl_session_cache shared:SSL_STAGING:10m;

  # Suchmaschinen sollen Staging nicht indizieren
  add_header X-Robots-Tag "noindex, nofollow" always;

  # Basic-Auth global vorgeschaltet
  auth_basic "Claimondo Staging";
  auth_basic_user_file /etc/nginx/.htpasswd-staging;

  # Body-Size für ZB1-/Foto-Uploads (analog Production)
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

Aktivieren:

```bash
ln -sf /etc/nginx/sites-available/staging.claimondo.de.conf /etc/nginx/sites-enabled/
nginx -t
# erwartet: "nginx: configuration file ... test is successful"
systemctl reload nginx
```

### 5. PM2-Placeholder für ersten Start

Damit GitHub Actions beim ersten Deploy keinen Fehler wegen fehlendem Prozess wirft, einmal manuell einen Platzhalter starten:

```bash
mkdir -p /var/www/claimondo-v2-staging
cat > /var/www/claimondo-v2-staging/server.js <<'EOF'
const http = require('http');
const port = process.env.PORT || 3001;
http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Staging Placeholder. Push auf staging-Branch um den echten Build zu deployen.\n');
}).listen(port, () => console.log(`Placeholder lauscht auf ${port}`));
EOF

PORT=3001 pm2 start /var/www/claimondo-v2-staging/server.js \
  --name claimondo-v2-staging \
  --env production \
  --max-memory-restart 1400M \
  --cwd /var/www/claimondo-v2-staging
pm2 save
```

### 6. .env.local für Staging

Server-seitige Secrets (Supabase Service-Role-Key, Twilio-Tokens, OpenAI-Keys etc.) müssen in `/var/www/claimondo-v2-staging/.env.local` liegen — der Workflow übernimmt sie bei jedem Deploy automatisch.

**Einfachster Weg:** Production-`.env.local` kopieren, da staging gegen dieselbe Supabase + dieselben externen Services arbeitet:

```bash
cp /var/www/claimondo-v2/.env.local /var/www/claimondo-v2-staging/.env.local
chown root:root /var/www/claimondo-v2-staging/.env.local
chmod 600 /var/www/claimondo-v2-staging/.env.local
```

**Wichtig:** Wenn die `.env.local` ein `NEXT_PUBLIC_APP_URL` setzt, kann das den Build-Wert überschreiben. NEXT_PUBLIC_* werden zur Build-Zeit gebaked — die `.env.local` zur Runtime wird für `process.env.<name>` in Server-Code gelesen. Falls das Probleme macht: in der Staging-`.env.local` `NEXT_PUBLIC_APP_URL=https://app.staging.claimondo.de` setzen.

### 7. End-to-End-Verifikation

```bash
# Placeholder antwortet?
curl -s -k -u '<USERNAME>:<PASSWORD>' https://app.staging.claimondo.de
# erwartet: "Staging Placeholder. Push auf staging-Branch ..."

# Ohne Auth → 401?
curl -s -k -o /dev/null -w "%{http_code}\n" https://app.staging.claimondo.de
# erwartet: 401

# Cert ok?
openssl s_client -connect app.staging.claimondo.de:443 -servername app.staging.claimondo.de -showcerts < /dev/null 2>&1 | grep "subject="
# erwartet: subject mit *.staging.claimondo.de oder staging.claimondo.de
```

Wenn alle drei grün → an Aaron melden: **"Staging-Slot bereit. PM2-Placeholder läuft auf Port 3001. Cert + nginx + Basic-Auth ok."**

Aaron mergt dann den Workflow-PR und pusht den `staging`-Branch — der erste echte Deploy ersetzt den Placeholder.

---

## Troubleshooting

**`nginx -t` failed mit "server_name is duplicated"**: bestehender Vhost matcht Wildcard auch. Prüfe `/etc/nginx/sites-enabled/*` auf Konflikte, ggf. `default_server`-Directive entfernen.

**Cert holen failed "Detail: DNS problem"**: DNS-Propagation noch nicht durch oder TXT-Record falsch. `dig +short TXT _acme-challenge.staging.claimondo.de @8.8.8.8` checken.

**PM2-Prozess hängt im stopped-State**: `pm2 delete claimondo-v2-staging && pm2 list` — dann nochmal starten. Das `pm2 delete`-First-Pattern ist auch im Workflow drin, also würde sich beim nächsten Deploy von selbst beheben.

**Production-Prozess gestört**: NICHT mit `pm2 reload all` oder ähnlichem arbeiten. Immer nur explizit `pm2 delete claimondo-v2-staging`, nie der Production-Prozess.

---

## Was läuft NICHT auf Staging

- **Crons:** Bewusst nicht. VPS-Crontab feuert weiterhin nur gegen `app.claimondo.de` (Production). Wenn das `crontab -l` zeigt, dass irgendwo `staging.app.claimondo.de` als Target steht — entfernen.
- **Datenbank-Mutationen via Cron:** Dieselbe Supabase wie Production, aber keine doppelten Cron-Hits.
- **DB-Backups:** Bleiben auf Production-Crontab (DB ist shared, ein Backup reicht).
