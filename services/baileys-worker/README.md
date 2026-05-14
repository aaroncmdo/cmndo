# Claimondo Baileys-WhatsApp-Worker (AAR-898)

WhatsApp-Worker auf Basis von [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys). Exposed eine interne HTTP-API auf Port 4001 für `POST /lookup` (Nummer-Existenz-Check) und `POST /send` (Magic-Link + Status-Updates). Wird vom Next.js-App-Server (`src/lib/whatsapp/baileys-client.ts`, AAR-899) konsumiert.

## Architektur

- Eigener PM2-Process **außerhalb** der Next.js-App
- Persistente Auth-State in `/etc/claimondo/baileys-auth/` (file-based, **muss in VPS-Backup**)
- Listen nur auf `127.0.0.1:4001` (kein öffentlicher Port, kein TLS nötig)
- Authentifizierung via Shared-Secret-Header `X-Internal-Token` (aus `/etc/claimondo/.env.local`)
- Email-Fallback im Caller: wenn Worker down oder kein WhatsApp, läuft Magic-Link über Email

## API

```
GET  /health
  → { connected, lastSeenAt, lastQrAt, reconnectsInWindow }

POST /lookup
  Body: { phone: "+49 …" }
  Header: X-Internal-Token: <BAILEYS_INTERNAL_TOKEN>
  → { hasWhatsApp: boolean, jid: string|null, checkedAt: ISO }

POST /send
  Body: { phone: "+49 …", text: string }
  Header: X-Internal-Token: <BAILEYS_INTERNAL_TOKEN>
  → { sent: boolean, messageId: string|null, jid: string }
```

Phone-Format: international (`+49…`), national-mit-führender-0 (`0151…`) oder `0049…` — wird in `normalizePhone()` auf `+49…` normalisiert.

## VPS-Setup (einmalig)

```bash
# 1. Code clonen + Workspace auf VPS auspacken
ssh vps
sudo mkdir -p /opt/claimondo-baileys /etc/claimondo/baileys-auth
sudo chown $USER:$USER /opt/claimondo-baileys /etc/claimondo/baileys-auth

# 2. Aus dem Monorepo-Service-Verzeichnis kopieren (oder git checkout)
cd /opt/claimondo-baileys
# Files aus services/baileys-worker hier ablegen
npm ci
npm run build

# 3. ENV in /etc/claimondo/.env.local
echo "BAILEYS_INTERNAL_TOKEN=$(openssl rand -hex 32)" | sudo tee -a /etc/claimondo/.env.local

# 4. PM2 starten
pm2 start ecosystem.config.cjs
pm2 save

# 5. QR-Login (einmalig)
pm2 logs claimondo-baileys
# Mit Handy: WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät hinzufügen
# → QR aus pm2-logs scannen
# → "Verbindung zu WhatsApp Web aufgebaut" erscheint im Log
```

## Health-Check

```bash
curl http://127.0.0.1:4001/health
# {"connected":true,"lastSeenAt":"2026-05-14T13:25:00.000Z","lastQrAt":null,"reconnectsInWindow":0}
```

## Risiken / Mitigation

- **ToS-Grauzone**: Baileys verstößt gegen WhatsApp-ToS. Eigene Claimondo-Telefonnummer, kein privater Mix. Bei >1000 Magic-Links/Tag auf offizielle WhatsApp Business API migrieren.
- **Number-Ban**: Wenn WA die Web-Session sperrt, kommt `connection.update` mit `DisconnectReason.loggedOut` — Worker stoppt Reconnect, Email-Fallback im Caller greift. Aaron bekommt Sentry-Alert, muss QR-Re-Login machen (`rm -rf /etc/claimondo/baileys-auth/* && pm2 restart claimondo-baileys && pm2 logs`).
- **DSGVO**: Lookup sendet Telefonnummer an WhatsApp-Server. Im Mini-Wizard-Consent erwähnt (AAR-902 DSGVO-Text).

## Linear / Spec

- Ticket: AAR-898
- Strecke: AAR-897 (Mini-Wizard + Magic-Link + Adaptives Onboarding)
- Spec: `docs/14.05.2026/mini-wizard-magic-link-konzept.md` §Phase 1b
- Memory: `project_baileys_whatsapp.md` (Worker-Architektur)
