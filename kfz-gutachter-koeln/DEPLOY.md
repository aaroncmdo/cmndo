# Kfz-Gutachter Wuppertal — Deploy / Go-Live Runbook

Standalone Next.js-16-App, eigener PM2-Prozess auf dem VPS `212.132.119.110`
(Ubuntu, nginx + PM2) — getrennt von claimondo-v2 + autounfall-io. Pattern 1:1
wie `autounfall-io/DEPLOY.md`. Port **3003**, Domain **kfz-unfallgutachter-wuppertal.de**.

> Voraussetzung vor SEA-Live: finale Assets eingespielt (siehe `MISSING-ASSETS.md`)
> und Tracking-ENV befüllt (sonst optimiert Smart Bidding blind).

## ✅ STATUS: LIVE seit 29.05.2026 — `https://kfz-unfallgutachter-wuppertal.de`

PM2 `kfz-gutachter-wuppertal` (:3003), nginx-vhost auf `proxy_pass 127.0.0.1:3003`
(bestehendes Certbot-Cert wiederverwendet), Smoke 46/0 (12 URLs). App-Verzeichnis:
`/var/www/kfz-unfallgutachter-wuppertal-app`. Vorheriger statischer Stub-vhost
gesichert unter `…/sites-available/kfz-unfallgutachter-wuppertal.de.bak-preNext`.

**Tatsächlicher Deploy-Weg (kein Git auf dem VPS!):** Der VPS hat kein Repo-Klon,
also wurde der Build NICHT per `git clone` geholt (die git-Schritte unten sind nur
Referenz). Stattdessen:
1. **Bilder optimieren** (Quell-ZIP-Assets sind ~19 MB/Stück → für SEA/Lighthouse
   inakzeptabel): resize + recompress auf Web-Größen (Hero 1600w, Besichtigung 900w,
   Cases 820w …) — z.B. via sharp. Live-Assets sind so optimiert (132 MB → 4,7 MB).
2. **Kuratiertes Tar** (Source + NUR referenzierte, optimierte Assets, kein
   node_modules/.next) lokal bauen.
3. **SFTP-Upload** ins root-Home (⚠️ SFTP akzeptiert nur **relative** Pfade →
   landet in `/root/`; absolute Pfade werfen ENOENT). Tar nach `/root/` entpacken
   nach `/var/www/kfz-unfallgutachter-wuppertal-app`.
4. Auf VPS: `npm ci` → `NEXT_PUBLIC_SITE_URL=https://kfz-unfallgutachter-wuppertal.de
   npm run build` (setzt Canonical/Sitemap/JSON-LD auf die Domain).
5. `pm2 start .next/standalone/server.js --name kfz-gutachter-wuppertal --cwd
   <app>/.next/standalone` mit `PORT=3003 HOSTNAME=127.0.0.1` + `pm2 save`.
6. vhost static→proxy_pass (Backup + `nginx -t` + reload), Cert bleibt.
7. Smoke + Screenshots gegen die Live-Domain.

Tooling lokaler Claude (VPS-Override): `scripts/vps-ssh-exec.py` (exec) bzw.
ad-hoc paramiko-SFTP. Re-Deploy = Schritte 1–5 wiederholen + `pm2 reload`.

## 1 · Build-Artefakt
`next.config.ts` hat `output: 'standalone'` + `turbopack.root` gepinnt →
`npm run build` erzeugt `.next/standalone/server.js`. Das `postbuild`-Script
(`scripts/copy-standalone.mjs`) kopiert `public/` + `.next/static/` nach
`.next/standalone/` (sonst fehlen CSS/Fonts/Bilder). PM2-Entrypoint =
`node .next/standalone/server.js`, **nicht** `next start`.

## 2 · ENV — `/etc/kfz-gutachter-wuppertal/.env.local`
`chmod 600`, `root:root`. Werte aus `.env.example`. Symlink ins Projekt-cwd.
```bash
sudo install -d -m 755 /etc/kfz-gutachter-wuppertal
sudo touch /etc/kfz-gutachter-wuppertal/.env.local
sudo chmod 600 /etc/kfz-gutachter-wuppertal/.env.local
sudo nano /etc/kfz-gutachter-wuppertal/.env.local   # NEXT_PUBLIC_SITE_URL etc.
```
Kein Supabase/Service-Role-Key nötig (kein eigenes Backend; Anfragen via Monika-Embed = Plan 2).

## 3 · Deploy-Pfad + Build
```bash
sudo install -d -o root -g root /var/www/kfz-gutachter-wuppertal
cd /var/www/kfz-gutachter-wuppertal
git clone <repo> . && git checkout main          # bzw. git pull
ln -sf /etc/kfz-gutachter-wuppertal/.env.local kfz-gutachter-wuppertal/.env.local
npm --prefix kfz-gutachter-wuppertal ci
# Bild-Assets einspielen — public/assets/img/ ist gitignored (siehe MISSING-ASSETS.md):
#   brand-assets-archiv.zip entpacken + wuppertal/ + shared/ + local/ nach
#   kfz-gutachter-wuppertal/public/assets/img/ kopieren (vor dem Build).
npm --prefix kfz-gutachter-wuppertal run build     # build + postbuild (assets-copy)
```
> Das Projekt liegt im Unterordner `kfz-gutachter-wuppertal/` des cmndo-Repos.
> Deploy-cwd = `/var/www/kfz-gutachter-wuppertal/kfz-gutachter-wuppertal`.

## 4 · PM2 — Port 3003
```js
{
  name: 'kfz-gutachter-wuppertal',
  cwd: '/var/www/kfz-gutachter-wuppertal/kfz-gutachter-wuppertal',
  script: '.next/standalone/server.js',
  env: { NODE_ENV: 'production', PORT: '3003', HOSTNAME: '127.0.0.1' },
}
```
```bash
pm2 start ecosystem.config.js --only kfz-gutachter-wuppertal   # oder pm2 reload ... --update-env
pm2 save
```

## 5 · nginx — vhost
`/etc/nginx/sites-available/kfz-unfallgutachter-wuppertal.de`:
```nginx
server {
    server_name kfz-unfallgutachter-wuppertal.de www.kfz-unfallgutachter-wuppertal.de;
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 32k;
        proxy_buffers 8 32k;
    }
}
```
```bash
# DNS-A-Record kfz-unfallgutachter-wuppertal.de → 212.132.119.110 (IONOS, KEIN Wildcard)
sudo ln -s /etc/nginx/sites-available/kfz-unfallgutachter-wuppertal.de /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kfz-unfallgutachter-wuppertal.de -d www.kfz-unfallgutachter-wuppertal.de
```

## 6 · Verifikation (nach Deploy)
```bash
pm2 status kfz-gutachter-wuppertal
SMOKE_BASE_URL=https://kfz-unfallgutachter-wuppertal.de npm run smoke   # 12 URLs, JSON-LD, sitemap
curl -sI https://kfz-unfallgutachter-wuppertal.de | head -1             # 200
curl -s  https://kfz-unfallgutachter-wuppertal.de/sitemap.xml | grep -c '<loc>'   # 12
```

## 7 · Rollback
- 500 → `git checkout HEAD~1 && npm --prefix kfz-gutachter-wuppertal ci && npm --prefix kfz-gutachter-wuppertal run build && pm2 reload kfz-gutachter-wuppertal`.
- nginx 5xx → `nginx -t`; vhost-`location /` temporär auf statisch + reload.

---
*Lokaler Claude = Code; VPS-Ausführung nur durch Aaron/Dev (DNS + nginx + PM2 + certbot).*
