# Claimondo Baileys-Service

WhatsApp-Web-Connection auf dem VPS. Phase 1 (Read-Only-Spike) — Lookup ob Telefonnummer auf WhatsApp ist. Phase 2 (Send) folgt nach erfolgreichem Spike.

## Deployment-Modell — WICHTIG

**Dieser Service liegt NICHT in `/var/www/claimondo-v2`** und wird NICHT vom Auto-Deploy (`deploy-vps.yml`) mit-installiert. Grund: das Auto-Deploy macht bei jedem Push `mv claimondo-v2 claimondo-v2-old`, was den persistenten Auth-State (`auth_info_baileys/`) zerstören würde.

Stattdessen lebt Baileys in einem **separaten Verzeichnis** mit eigenem Update-Workflow:

```
/opt/claimondo-baileys/
├── source/        ← git clone vom Hauptrepo (für services/baileys/-Updates)
└── baileys/       ← Symlink auf source/services/baileys/
    ├── auth_info_baileys/   ← persistent, NIE überschreiben
    ├── logs/
    └── node_modules/
```

## Endpoints

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/health` | offen | Connection-State (für Monitoring/Smoke-Test) |
| `POST` | `/check` | `X-Baileys-Token` | `{phone}` → `{on_whatsapp:bool, jid}` |
| `GET` | `/qr` | `X-Baileys-Token` | aktueller QR-Code (nur bei Re-Auth) |

## Setup auf dem VPS (einmalig)

```bash
# 1. Separates Verzeichnis aufsetzen (nicht /var/www/claimondo-v2!)
sudo mkdir -p /opt/claimondo-baileys
sudo chown $USER /opt/claimondo-baileys
cd /opt/claimondo-baileys

# 2. Repo clonen + Symlink für sauberen Pfad
git clone https://github.com/aaroncmdo/cmndo.git source
ln -sfn /opt/claimondo-baileys/source/services/baileys baileys
cd /opt/claimondo-baileys/baileys

# 3. Dependencies + Logs-Dir
npm install
mkdir -p logs

# 4. Auth-Token generieren (zufällige 32 Hex-Chars)
TOKEN=$(openssl rand -hex 16)
echo "Token (auch für Next.js-Env): $TOKEN"

# 5. .env-File mit Token + Konfig
cat > .env <<EOF
BAILEYS_AUTH_TOKEN=$TOKEN
BAILEYS_PORT=3055
BAILEYS_AUTH_DIR=./auth_info_baileys
LOG_LEVEL=info
EOF

# 6. PM2 starten mit env-Injection
pm2 start ecosystem.config.cjs --update-env
pm2 save
pm2 startup  # einmalig — sorgt für Auto-Start nach VPS-Reboot

# 7. QR-Code im Logs scannen
pm2 logs claimondo-baileys --lines 100 --nostream
# → ASCII-QR im Terminal
# → Aaron-Phone: WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen
# → Logs zeigen "✓ WhatsApp-Connection live"

# 8. Smoke-Test (auf VPS)
curl -s http://localhost:3055/health
# → {"state":"open", "has_qr":false, ...}

curl -X POST http://localhost:3055/check \
  -H "X-Baileys-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+4915112345678"}'
# → {"phone":"4915112345678", "on_whatsapp":true, "jid":"...@s.whatsapp.net"}

# 9. Token in Next.js-Env exposen damit /api/admin/baileys-check funktioniert
pm2 set BAILEYS_AUTH_TOKEN $TOKEN
pm2 set BAILEYS_BASE_URL http://localhost:3055
pm2 restart claimondo-v2 --update-env
```

## Update-Workflow (bei künftigen Code-Änderungen)

Wenn Aaron Änderungen am Baileys-Service merged (services/baileys/ im Hauptrepo), pullt VPS-Claude manuell:

```bash
cd /opt/claimondo-baileys/source
git pull origin main

cd /opt/claimondo-baileys/baileys
npm install   # nur falls package.json sich geändert hat

pm2 restart claimondo-baileys
# Auth-State bleibt erhalten weil baileys/auth_info_baileys/ persistent ist
# (gitignored im Repo, lokal generiert beim ersten QR-Scan)
```

**Dieser Schritt läuft NICHT automatisch.** Auto-Deploy aktualisiert nur Next.js. Aaron oder VPS-Claude triggert Baileys-Updates manuell — passt zur Realität dass der Baileys-Code selten geändert wird (vs. täglich Marketing/Feature-PRs).

## Re-Auth nach 14 Tagen Disconnect

```bash
# Logs zeigen "logged out — Auth-Files löschen"
rm -rf /var/www/claimondo-v2/services/baileys/auth_info_baileys
pm2 restart claimondo-baileys
pm2 logs claimondo-baileys --lines 50
# → neuer QR-Code, Aaron neu scannen
```

## Risiken

- **Banning**: WhatsApp kann jede Nummer permanent bannen wenn sie Mass-Sending oder Spam-Reports erkennt. Mitigation: dedizierte Business-Nummer (separater SIM), Rate-Limiting in Next.js-Layer
- **Re-Auth**: alle 7-14 Tage. Mitigation: Cron-Health-Check + Slack-Alert
- **API-Changes**: WhatsApp ändert das Web-Protocol gelegentlich. Mitigation: `@whiskeysockets/baileys` Updates via Dependabot

Volle Architektur + Migration-Plan siehe `docs/backlog-2026-05-10.md` (Block „Baileys statt Twilio + Meta").

## Erreichbar von Next.js

Next.js → `src/lib/whatsapp/baileys-client.ts` → POST `http://localhost:3055/check` (interne VPS-Connection, kein external).

In Production via nginx-Proxy oder direkt via `localhost:3055` aus dem Next.js-PM2-Service heraus erreichbar.
