# autounfall.io — Deploy / Go-Live Runbook (WP-8)

Standalone Next.js-16-App, eigener Server-Prozess auf dem VPS — getrennt von
claimondo-v2. VPS `212.132.119.110` (Ubuntu, nginx + PM2). Ist-Stand (verifiziert
2026-05-23): vhost `autounfall.io` + SSL-Cert + DNS-A-Record existieren bereits,
zeigen aktuell einen **statischen Platzhalter**. WP-8 stellt auf die echte App um.

> **Reihenfolge:** Erst **WP-6** (`/gutachter-finden` Lead-Form, PR #1641) nach
> `main`, dann deployen — sonst liefern alle „Sachverständigen anfragen"-CTAs
> (aus WP-2/3/4/5/7) einen 404. Inhalt/Tools (WP-2/3/4/5/7) funktionieren auch
> ohne WP-6.

## 1 · Build-Artefakt
`next.config.ts` hat `output: 'standalone'` + `turbopack.root` gepinnt →
`npm run build` erzeugt `.next/standalone/server.js`. Start in Produktion:
`node .next/standalone/server.js` (PM2-Entrypoint), **nicht** `next start`.

## 2 · ENV — `/etc/autounfall/.env.local`
GETRENNT von `/etc/claimondo/.env.local` (nur au.io-Secrets). `chmod 600`,
`root:root`. Vars siehe `.env.example`:

| Var | Sichtbarkeit | Quelle |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | client | `https://autounfall.io` |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | client | `autounfall.io` |
| `NEXT_PUBLIC_SITE_EMAIL` | client | **au.io-eigene Mail** (Aaron — kein Claimondo-Footprint) |
| `NEXT_PUBLIC_SITE_PHONE` | client | **au.io-eigene Nummer** (Aaron — nicht 0221 25906530) |
| `NEXT_PUBLIC_SUPABASE_URL` | client | geteiltes Supabase (paizkjajbuxxksdoycev) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | geteiltes Supabase — niemals `NEXT_PUBLIC_*` |

```bash
sudo install -d -m 755 /etc/autounfall
sudo touch /etc/autounfall/.env.local
sudo chmod 600 /etc/autounfall/.env.local
sudo nano /etc/autounfall/.env.local   # Werte aus .env.example eintragen
```

## 3 · Deploy-Pfad + Build
```bash
sudo install -d -o root -g root /var/www/autounfall.io
cd /var/www/autounfall.io
git clone <repo> . && git checkout main          # bzw. git pull
ln -sf /etc/autounfall/.env.local .env.local      # dotenv liest aus cwd
npm --prefix autounfall-io ci
npm --prefix autounfall-io run build               # erzeugt autounfall-io/.next/standalone
```
> Hinweis: Das au.io-Projekt liegt im Unterordner `autounfall-io/` des cmndo-Repos.
> Deploy-cwd ist `/var/www/autounfall.io/autounfall-io` (dort liegt `.next/standalone`).
> Alternativ nur den `autounfall-io/`-Unterbaum auschecken (sparse-checkout).

## 4 · PM2 — Port 3002
```js
// ecosystem (Ergänzung zur bestehenden pm2-claimondo.config.js)
{
  name: 'autounfall-io',
  cwd: '/var/www/autounfall.io/autounfall-io',
  script: '.next/standalone/server.js',
  env: { NODE_ENV: 'production', PORT: '3002', HOSTNAME: '127.0.0.1' },
  // .env.local (Symlink) wird von Next.js standalone via dotenv beim Start gelesen
}
```
**WICHTIG — Standalone-Assets kopieren (verifiziert):** `next build` legt in
`.next/standalone/` nur `server.js` + `node_modules` + `package.json` ab —
**NICHT** `public/` und **NICHT** `.next/static/`. Ohne diese fehlen CSS,
lokale Fonts, Favicon und OG-Bilder. Nach jedem Build kopieren:
```bash
cd /var/www/autounfall.io/autounfall-io
cp -r public            .next/standalone/public
cp -r .next/static      .next/standalone/.next/static
```
Dann erst PM2 (Entrypoint läuft aus `.next/standalone/`):
```bash
pm2 start ecosystem.config.js --only autounfall-io   # oder: pm2 reload autounfall-io --update-env
pm2 save
```

## 5 · nginx — vhost auf proxy_pass umstellen
Im bestehenden `autounfall.io`-vhost die statische `location /` ersetzen (SSL-Block
+ `server_name` bleiben):
```nginx
location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # WP-6 POST /gutachter-finden (Server-Action) trägt Supabase-Cookies nicht,
    # aber große Header generell abfedern (Lektion claimondo-v2 502):
    proxy_buffer_size 32k;
    proxy_buffers 8 32k;
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 6 · Staging (optional) — `staging.autounfall.io` → :3003
```bash
# DNS-A-Record staging.autounfall.io → 212.132.119.110 (IONOS — KEIN *.au.io-Wildcard)
sudo certbot --nginx -d staging.autounfall.io
# PM2 autounfall-io-staging, PORT 3003, eigener Deploy-Pfad
```

## 7 · Verifikation (nach Deploy)
```bash
pm2 status autounfall-io                        # online, uptime resettet
curl -sI https://autounfall.io | head -1        # 200, eigene App (nicht statisch)
curl -s https://autounfall.io/sitemap.xml | grep -c '<loc>'   # ~142
# Stichproben 200: / · /rechner · /versicherer-decoder · /kfz-unfall/koeln/auffahrunfall
# PSEO = noindex (im HTML <meta name="robots" content="noindex">)
# Plausible-Testevent im Dashboard
# WP-6 (falls live): Test-Lead über /gutachter-finden → erscheint in /dispatch/leads
```
- **GSC:** eigene Property `autounfall.io` anlegen (kein gemeinsames Tag/GTM mit claimondo — Footprint-Trennung).

## 8 · Rollback
- 500 → `cd /var/www/autounfall.io && git checkout HEAD~1 && npm --prefix autounfall-io ci && npm --prefix autounfall-io run build && pm2 reload autounfall-io`.
- nginx 5xx → `nginx -t`; im Notfall vhost-`location /` zurück auf statisch + reload.
- Cert → `certbot renew`.

---
*WP-8. Verantwortlich: Dev/Aaron (Server). Lokaler Claude = Code; VPS-Ausführung
nur mit Aaron-Override (`scripts/vps-ssh-exec.py`).*
