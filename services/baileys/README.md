# Claimondo Baileys-Service

WhatsApp-Web-Connection auf dem VPS. Phase 1 (Read-Only-Spike) — Lookup ob Telefonnummer auf WhatsApp ist. Phase 2 (Send) folgt nach erfolgreichem Spike.

## Endpoints

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/health` | offen | Connection-State (für Monitoring/Smoke-Test) |
| `POST` | `/check` | `X-Baileys-Token` | `{phone}` → `{on_whatsapp:bool, jid}` |
| `GET` | `/qr` | `X-Baileys-Token` | aktueller QR-Code (nur bei Re-Auth) |

## Setup auf dem VPS (einmalig)

```bash
# 1. Service-Verzeichnis pullen (kommt mit dem regulären deploy-vps.yml)
cd /var/www/claimondo-v2/services/baileys

# 2. Dependencies
npm install

# 3. Auth-Token setzen (für /check + /qr)
pm2 set claimondo-baileys:BAILEYS_AUTH_TOKEN "<random-32-chars>"

# 4. Service starten
pm2 start ecosystem.config.cjs
pm2 save

# 5. QR-Code im Logs scannen mit Aaron-Phone
pm2 logs claimondo-baileys --lines 50
# → QR im Terminal-Output, Aaron tappt mit WhatsApp → Verknüpfte Geräte → Gerät verknüpfen

# 6. Smoke-Test
curl http://localhost:3055/health
# → {"state":"open", "has_qr":false, ...}

curl -X POST http://localhost:3055/check \
  -H "X-Baileys-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+4915112345678"}'
# → {"phone":"4915112345678", "on_whatsapp":true, "jid":"...@s.whatsapp.net"}
```

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
