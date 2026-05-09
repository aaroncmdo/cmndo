# VPS Setup — app.claimondo.de

Anleitung für die Claude Code Instanz auf dem VPS (212.132.119.110).
Führe die Schritte der Reihe nach aus.

## 1. Voraussetzungen installieren

```bash
apt-get update && apt-get install -y nginx certbot python3-certbot-nginx git curl
npm install -g pm2
```

## 2. SSH Deploy-Key für GitHub erzeugen

```bash
ssh-keygen -t ed25519 -C "vps-deploy@claimondo.de" -f /root/.ssh/github_deploy -N ""
cat /root/.ssh/github_deploy.pub
```

**Den Public Key kopieren** und unter:
→ GitHub → cmndo Repo → Settings → Deploy Keys → "Add deploy key" einfügen (Read-only reicht)

Den Private Key als GitHub Secret hinterlegen:
→ GitHub → cmndo Repo → Settings → Secrets → Actions → `VPS_SSH_KEY` = Inhalt von `/root/.ssh/github_deploy`

```bash
# SSH-Config damit git den richtigen Key nutzt
cat >> /root/.ssh/config << 'EOF'
Host github.com
  IdentityFile /root/.ssh/github_deploy
  StrictHostKeyChecking no
EOF
```

## 3. Repo klonen (Erst-Setup)

```bash
git clone git@github.com:aaroncmdo/cmndo.git /var/www/claimondo-v2
cd /var/www/claimondo-v2
```

## 4. .env.local anlegen

```bash
cat > /var/www/claimondo-v2/.env.local << 'EOF'
# Alle Werte aus dem Vercel-Dashboard kopieren:
# Settings → Environment Variables

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
MAPBOX_SECRET_TOKEN=
NEXT_PUBLIC_MAPBOX_STYLE_URL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TWILIO_SMS_FROM=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
ELEVENLABS_API_KEY=
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=
GOOGLE_TTS_API_KEY=
OPENWEATHER_API_KEY=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
EOF

# Dann mit dem echten Editor befüllen:
nano /var/www/claimondo-v2/.env.local
```

## 5. Ersten Build auf dem VPS ausführen

```bash
cd /var/www/claimondo-v2
npm ci
npm run build
```

> Hinweis: Der Build braucht ~5-10 Min und bis zu 1.5 GB RAM. Falls OOM:
> `NODE_OPTIONS="--max-old-space-size=1536" npm run build`

Nach dem Build static-Files in standalone kopieren:
```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cp .env.local .next/standalone/.env.local
```

## 6. PM2 konfigurieren

```bash
cat > /var/www/pm2-claimondo.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'claimondo-v2',
    script: '/var/www/claimondo-v2/.next/standalone/server.js',
    cwd: '/var/www/claimondo-v2/.next/standalone',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOSTNAME: '0.0.0.0',
    },
    max_memory_restart: '1400M',
    restart_delay: 3000,
    instances: 1,
  }]
}
EOF

pm2 start /var/www/pm2-claimondo.config.js
pm2 save
pm2 startup  # Befehl ausführen der ausgegeben wird
```

## 7. nginx konfigurieren

```bash
cat > /etc/nginx/sites-available/claimondo << 'EOF'
server {
    listen 80;
    server_name app.claimondo.de claimondo.de www.claimondo.de;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        client_max_body_size 20M;
    }
}
EOF

ln -sf /etc/nginx/sites-available/claimondo /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

## 8. SSL mit Let's Encrypt

DNS muss vorher auf die VPS-IP zeigen (212.132.119.110).

```bash
certbot --nginx -d app.claimondo.de -d claimondo.de -d www.claimondo.de \
  --non-interactive --agree-tos -m tech@claimondo.de
```

## 9. DNS bei IONOS setzen

Im IONOS-Panel für alle Domains:

| Subdomain | Typ | Wert |
|-----------|-----|------|
| app | A | 212.132.119.110 |
| @ (claimondo.de) | A | 212.132.119.110 |
| www | A | 212.132.119.110 |
| gutachter | CNAME | app.claimondo.de |
| makler | CNAME | app.claimondo.de |
| kanzlei | CNAME | app.claimondo.de |

## 10. GitHub Actions Secrets hinterlegen

Im GitHub Repo → Settings → Secrets → Actions:

| Secret | Wert |
|--------|------|
| `VPS_SSH_KEY` | Inhalt von `/root/.ssh/github_deploy` (private key) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox Token |
| `NEXT_PUBLIC_IMAGIN_CUSTOMER` | Imagin Customer ID |
| `NEXT_PUBLIC_ELEVENLABS_VOICE_ID` | ElevenLabs Voice ID |
| `SENTRY_AUTH_TOKEN` | Sentry Auth Token |

Ab jetzt: jeder Push auf `main` → GitHub Actions baut → deployt auf VPS → pm2 restart.

## Hilfreiche Befehle

```bash
pm2 logs claimondo-v2        # Live-Logs
pm2 status                   # Status
pm2 restart claimondo-v2     # Manueller Restart
nginx -t                     # Nginx-Config prüfen
systemctl status nginx        # Nginx-Status
certbot renew --dry-run      # SSL-Renewal testen
```
