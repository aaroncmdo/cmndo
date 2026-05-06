# Baileys-Integration — Implementierungsplan

Status: **Planung**. Eigene Session nach Design-Polish + VPS-Deploy.

## Warum Baileys

- Aktueller WhatsApp-Stack: **Twilio Content-Templates** (kostet pro Nachricht)
- Baileys: WhatsApp Web Reverse-Engineered Library — kostenlos, eigene Nummer, mehr Flexibilität
- Trade-off: Account-Ban-Risiko (besonders bei Bulk-Sends), kein offizieller Support, bricht potenziell mit WhatsApp-Updates

## Hosting-Voraussetzung 🔴

Baileys braucht **persistente WebSocket-Verbindung** zu WhatsApp Web. Auf Vercel/Serverless **nicht möglich** — Function-Timeouts schließen Socket nach Sekunden.

→ **Hosting nur auf VPS** (IONOS-VPS mit `app.claimondo.de`, geplant für übermorgen). Als eigener `pm2`/`systemd`-Worker-Prozess parallel zur Next.js-App.

## Offene Klärungen vor Implementation

1. **Welche Nummer?**
   - [ ] Aaron's Geschäfts-Nummer (Risk: Bulk-Ban)
   - [ ] Neue WhatsApp-Business-Nummer mit eigener SIM
   - [ ] WhatsApp-Business-App Nummer

2. **Use-Case-Scope:**
   - [ ] **Replacement** Twilio: kompletter Refactor von `lib/whatsapp/*`, alle 35+ Templates umstellen
   - [ ] **Additional Channel**: parallel zu Twilio, z.B. Inbound-Empfang oder Gruppenchat
   - [ ] **Inbound only**: Baileys empfängt eingehende Nachrichten von Kunden → schreibt nach `nachrichten`-Tabelle, Outbound bleibt Twilio

3. **Reconnect-Strategie:**
   - [ ] Auto-reconnect bei Disconnect via `connection.update`-Event
   - [ ] Admin-Notification wenn Auth-State invalidiert wird (jemand muss neuen QR scannen)
   - [ ] Auth-State-Persistenz: in DB (verschlüsselt) oder Disk-File auf VPS?

## Technische Architektur (Vorschlag)

```
┌─────────────────────────────────────────────────────────────┐
│                     IONOS VPS                                │
│                                                              │
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │   Next.js App    │────────▶│  Baileys Worker (pm2)   │  │
│  │  (Port 3000)     │  HTTP   │  - WebSocket → WhatsApp │  │
│  │                  │  Queue  │  - QR/Pair-Code via UI  │  │
│  └────────┬─────────┘         │  - Persistent Auth-State│  │
│           │                   └────────┬────────────────┘  │
│           │                            │                    │
│           ▼                            ▼                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Supabase (extern)                        │  │
│  │  - nachrichten (inbound writes)                       │  │
│  │  - whatsapp_outbound_queue (outbound jobs)            │  │
│  │  - baileys_auth_state (verschlüsselt)                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Komponenten

1. **Baileys-Worker** (`scripts/baileys-worker.mjs`)
   - Long-running Node-Prozess
   - Persistent WebSocket zu WhatsApp
   - Polled `whatsapp_outbound_queue`-Tabelle alle 2-5s für neue Sends
   - Bei Inbound-Message: insert in `nachrichten` (kanal=`whatsapp`)
   - Auth-State in DB-Tabelle `baileys_auth_state` (verschlüsselt mit existing `encryption.ts`)

2. **Outbound-Queue-Tabelle**
   ```sql
   CREATE TABLE whatsapp_outbound_queue (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     telefon TEXT NOT NULL,
     nachricht TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
     created_at TIMESTAMPTZ DEFAULT now(),
     gesendet_am TIMESTAMPTZ,
     fehler TEXT,
     fall_id UUID REFERENCES faelle(id)
   );
   ```

3. **`lib/baileys/send.ts`** — Drop-in zu `lib/whatsapp/send.ts`
   - Statt Twilio-API-Call: insert in Queue
   - Worker pickt es auf, sendet via Baileys, updated Status

4. **`/admin/baileys/`** — Setup-Page für Aaron
   - QR-Code-Anzeige (vom Worker via SSE/Polling)
   - Connection-Status (connected/disconnected/qr-pending)
   - Pair-Code-Eingabe (alternative zu QR)
   - Logout-Button

## Phasen

### Phase 1 — Dependency + Skeleton (kann jetzt schon)
- [ ] `npm i @whiskeysockets/baileys` + `qrcode-terminal` (Dev) + `pino` (Logger)
- [ ] `lib/baileys/`-Verzeichnis mit Stub-Files
- [ ] Migration: `whatsapp_outbound_queue` + `baileys_auth_state` Tabellen
- [ ] **Noch nicht** mit Twilio mergen — Worker existiert nicht

### Phase 2 — Worker (nach VPS-Deploy)
- [ ] `scripts/baileys-worker.mjs` mit Connection-Logic
- [ ] Auth-State-Persistenz in DB (`useMultiFileAuthState` adaptieren auf DB-Storage)
- [ ] Inbound-Message-Handler → `nachrichten`-Insert
- [ ] Outbound-Queue-Polling
- [ ] `pm2 ecosystem.config.cjs` mit Worker-Eintrag

### Phase 3 — Admin-UI für QR + Status
- [ ] `/admin/baileys/page.tsx` (Status + QR)
- [ ] SSE-Endpoint für Live-QR
- [ ] Aaron scannt einmal mit Business-Nummer

### Phase 4 — Schrittweise Migration
- [ ] Pro WhatsApp-Template entscheiden: Twilio oder Baileys?
- [ ] Inbound-only zuerst (kein Risk)
- [ ] Dann selektive Outbound-Templates

## Risiken

- **WhatsApp-Account-Ban** bei zu vielen Nachrichten (Rate-Limiting nötig: max 30 msgs/min als Faustregel, aber unklar ob Meta das genau so misst)
- **Worker-Crash auf VPS** = WhatsApp offline → Twilio-Fallback notwendig oder ein zweiter Worker
- **WhatsApp-Web-Updates** brechen Baileys gelegentlich → Library aktuell halten

## Referenzen

- Library: https://github.com/WhiskeySockets/Baileys
- Aktuelle WA-Stack-Files: `src/lib/whatsapp/*` + `src/lib/communications/send.ts`
- Twilio-Templates: `src/lib/whatsapp/template-sids.ts` (35+ Einträge)
