# WhatsApp → Baileys (Twilio raus) — Build + Verifikation + Infra-Cutover

**Datum:** 2026-06-02 · **Branch:** `kitta/whatsapp-baileys-only` (off staging) · **PR:** gegen staging (nicht selbst gemergt)
**Plan:** `docs/superpowers/plans/2026-06-02-whatsapp-baileys-only.md`
**Scope-Lock (Aaron):** „Voll jetzt (Outbound + Inbound-Port)" + „Twilio-WA komplett raus" (Baileys-only, kein Twilio-Fallback; Email-Fallback bleibt wo er existiert).

## ✅ Infra-Deploy-Update (2026-06-02, Root-Zugriff von Aaron)

VPS-Recon + Deploy ergänzend zu diesem Code-PR — vieles war bereits live:
- **Outbound lief schon über Baileys:** Worker `claimondo-baileys` (PM2) connected, **Port 3055** (Memory-„4001" war falsch), WA-Nr `4915153608515`, `BAILEYS_BASE_URL/AUTH_TOKEN` gesetzt, `TWILIO_WHATSAPP_FROM` nie gesetzt (Twilio-WA war ohnehin tot).
- **Inbound scharfgeschaltet (NEU):** Der Worker (git-Checkout der cmndo-Repo auf `main` unter `/opt/claimondo-baileys/source`) hatte den `messages.upsert`-Inbound-Handler bereits in `main`, war aber auf dem VPS **stale** (Commit Mai). Deployed: `git checkout origin/main -- services/baileys/src/index.js` + Env-Inject (`CRON_SECRET` + `NEXT_PUBLIC_SITE_URL=http://localhost:3000` — beide fehlten dem Worker) + `pm2 restart --update-env` + `pm2 save`. WA **reconnected ohne QR** (Auth-State intakt), Worker→App-Auth verifiziert (right-bearer→400, wrong→401, datenfrei).
- **Effekt:** WA-Replies an `4915153608515` fließen jetzt an prod `localhost:3000/api/baileys/inbound` (vorher Black-Hole). Solange #2255 nicht auf prod ist, greift der **Stub** (Text→`nachrichten`); die volle Logik (Intents/embed-B/OCR) + Outbound-Cleanup aktiviert der #2255-Deploy.
- **Medien:** Worker schickt aktuell nur `has_media:true` (keine Bytes) → defensiver Notification-Pfad greift. Echter Medien-Upload-Contract = späterer Worker-Ausbau (s.u.).
- Backup auf VPS: `services/baileys/src/index.js.bak-pre-inbound-20260602`.

## Was dieser PR liefert (CODE)

WhatsApp-Versand **und** -Empfang laufen über den Baileys-VPS-Service. Twilio ist aus dem WhatsApp-Pfad raus; Twilio bleibt nur für **SMS / Voice / 2FA-Verify**.

### Outbound — Leaf-Migration (commit `55e7cfa3` + `990884c0`)
Statt jede Call-Site umzuschreiben, wurde der **einzige Twilio-Send-Leaf** migriert — alle Caller fließen automatisch über Baileys, ohne dass ein Call-Site-File (termin-actions, Fallakte-Chat, Dispatch-Actions …) angefasst wurde (→ keine Kollision mit `termin-engine`/`aar-939`-Sessions):

- `src/lib/whatsapp.ts` — `sendWhatsApp()` ruft jetzt `sendWhatsAppText` (Baileys), E.164-Normalisierung, behält `{success,sid,error}`-Signatur. `sendStatusWhatsApp` vereinfacht (Template-Zweig + Twilio-Fallback raus). `NACHRICHT_TO_TEMPLATE`-Map gelöscht.
- `src/lib/whatsapp/send-template.ts` — Twilio-Content-API-Block raus; immer Legacy-Text → Baileys-Leaf. `provider:'baileys'`. (Templates waren via `WHATSAPP_USE_TEMPLATES` ohnehin schon dormant; Baileys ist Text-only.)
- `src/lib/communications/send.ts` — Freitext-Pfad: redundanten Doppel-Baileys + irreführenden „Twilio-Fallback" entfernt → ein Aufruf des Baileys-Leafs.
- `src/lib/notifications/channels/whatsapp.ts` — Kommentar/Fehlertext Twilio→WhatsApp.
- `src/app/api/test-whatsapp/route.ts` — Twilio-Env-Precheck + `TWILIO_WHATSAPP_FROM`-Echo raus (Send lief schon über den Leaf).

**Audit-Sweep bestätigt: KEIN echter Twilio-WA-Send-Leak mehr.** Alle `Messages.json`-Caller (`dispatch/leads/.../dokumente-anfordern.ts`, `flowlink.ts`, `lib/whatsapp/send-sms-template.ts`) senden via **`TWILIO_SMS_FROM` (SMS)** — die WhatsApp-Branches dieser Files nutzen `sendCommunication`→Baileys. `*.messages.create`-Treffer sind alle **Anthropic** (AI/OCR), kein Twilio.

### Inbound — Port in die Baileys-Route `/api/baileys/inbound`
Die bestehende Baileys-Inbound-Route (Text→`nachrichten`, Dedup via `external_message_id`) wurde erweitert. **Die Twilio-Inbound-Route blieb unangetastet** (gehört aar-939) — die Logik ruft dieselben Shared-Helper.

- **Text-Intents** (commit `b5dfc74b`) — `src/lib/inbound/process-inbound-text.ts`: `detectIntent` (JA/NEIN/Umtermin) + `processInboundText` — embed-B-Resolution (stale `nur_gutachter`-Termin → `closeNurGutachterTerminAlsDurchgefuehrt` / `createEmbedBKlaerungTask`), Termin-Bestätigung (`gutachter_termine.status='bestaetigt'`), Nein/Umtermin → KB-Notification. Identisches Stale-Gate wie Twilio-Route + Kunde-Banner + Cron. Route vereinheitlicht auf `matchInboundToFall`.
- **Medien** (commit `e77537b3`) — `src/lib/inbound/process-inbound-media.ts`: **bytes-neutral** (`processInboundMedia(db,{…,mediaFiles:{buffer,mime}[]})`) → ZB1-OCR (`runZB1Ocr` → `leads`-Felder inkl. `fin`/`hsn`/`tsn`/Halter), Polizeibericht (+`scheduleBkatAnalyseAfterUpload`), Mehrfachbild-Fallback, Fall-Dokumente (`fall_dokumente`, `quelle:'whatsapp'`, `sichtbar_fuer` 5 Rollen). Route resolved Bytes aus `storage_path`→download / `url`→fetch / `base64`.

## Verifikation

- **tsc:** `npx tsc --noEmit` → 0 Fehler (nach jedem Task).
- **Unit:** `npx vitest run src/lib/whatsapp src/lib/inbound` → **grün** (Outbound-Leaf 3 + Text-Intents 8 + Medien 5 = 16+). embed-B JA/NEIN + ZB1→`fin` + Fall→`fall_dokumente` abgedeckt.
- **`npm run build`:** siehe PR-Status (Route-/Server-Action-Validierung).
- **Nicht lokal smokebar:** echter Baileys-Versand (Worker = VPS-localhost) + Worker-Inbound-Transport. → Staging/Prod nach Infra.

## 🔴 INFRA — Aaron / VPS (Voraussetzung fürs Scharfschalten)

Der CODE ist Baileys-ready. Bevor WhatsApp end-to-end über Baileys läuft:

1. **`BAILEYS_BASE_URL` + `BAILEYS_AUTH_TOKEN`** im VPS-`/etc/claimondo/.env.local` setzen (prod + staging). **Port-Klärung:** Code-Default ist `http://localhost:3055` (`baileys-client.ts`), Memory nennt `4001` — verifizieren welcher Port der Worker wirklich hört, ENV danach setzen.
2. **WhatsApp-Nummer** am Baileys-Worker verbunden (QR-Pairing), Auth-State gebackupt.
3. **Worker-Inbound-Webhook:** Worker postet eingehende Nachrichten an `POST /api/baileys/inbound` mit `Authorization: Bearer ${CRON_SECRET}`. Body:
   ```json
   { "phone":"4915123456789", "text":"…", "message_id":"…", "timestamp":1730000000, "has_media":false }
   ```
4. **Medien-Contract (für `processInboundMedia`):** Bei Medien lädt der Worker die Datei selbst in den `fall-dokumente`-Bucket und ergänzt:
   ```json
   "media":[{ "storage_path":"inbound/4915…/<uuid>.jpg", "mime":"image/jpeg", "filename":"foto.jpg" }]
   ```
   (Alternativ `"url":"…"` für unauth. Fetch oder `"base64":"…"`.) **Solange der Worker nur `has_media:true` ohne `media[]` schickt**, greift der defensive Pfad: `nachrichten.hat_anhang=true` + Notification an Lead-Owner/KB („Worker liefert Datei noch nicht aus, bitte im Chat prüfen") — kein lautloser Verlust.

## 🟡 Cutover-Cleanup — separater PR NACH bestätigtem Infra-Cutover

Erst wenn der Baileys-Worker prod-seitig Inbound liefert und die WA-Nummer Baileys-verbunden ist:

- **Löschen:** `src/app/api/webhooks/twilio/inbound/route.ts`, `src/app/api/webhooks/twilio/status/route.ts`, `src/app/api/twilio/inbound-kb-whatsapp/route.ts`. (Bewusst NICHT in diesem PR — bis zum Cutover sind sie die laufende Inbound-Strecke; vorzeitige Löschung = Inbound-Lücke. `twilio/inbound` gehört außerdem aktiv der aar-939-Session.)
- **`twilio_whatsapp_nummer`-Feature:** `src/lib/twilio/provision-kb-nummer.ts` + Admin-UI (`admin/team/[id]/MitarbeiterDetail.tsx`, `page.tsx`) — KB-eigene WA-Nummer war Twilio-Content-API; mit Baileys (eine Nummer) obsolet. Entfernen oder als „inaktiv" markieren.
- **ENV:** `TWILIO_WHATSAPP_FROM` aus prod/staging-Env entfernen. (`TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`VERIFY_SERVICE_SID`/`SMS_FROM` BLEIBEN — SMS/Voice/Verify.)
- **Datenschutz (LEGAL-REVIEW Pflicht):** `src/content/legal/datenschutz.md` §WhatsApp (~Z.325-328) nennt aktuell **Twilio als WhatsApp-Business-API-Anbieter**. Nach Cutover umschreiben auf „WhatsApp-Versand über eine selbst-betriebene Baileys-Verbindung; kein Twilio als WhatsApp-Subprozessor mehr". **Achtung:** Baileys ist eine **inoffizielle** WhatsApp-Anbindung (ToS-Grauzone) — Datenfluss-/Subprozessor-Beschreibung muss von Aaron/Legal final geprüft werden, NICHT blind übernehmen. Bewusst nicht in diesem Code-PR geändert (Legal-Entscheidung + erst zum echten Cutover wahr).

## Kollisions-Hygiene

Touch-Set dieses PR: `lib/whatsapp.ts`, `lib/whatsapp/send-template.ts`, `lib/notifications/channels/whatsapp.ts`, `lib/communications/send.ts`, `api/test-whatsapp/route.ts`, `api/baileys/inbound/route.ts`, `lib/inbound/*` (neu), Docs. **Keine** Twilio-Route, **keine** termin-actions, **keine** Admin-UI → kein Trample mit den parallel laufenden `aar-939-*` / `termin-engine-*` Sessions.

## DRY-Transitional

`syncDokumentUploadAnfrage` + die Intent/Medien-Logik liegen vorübergehend doppelt (Twilio-Route + neue `lib/inbound/*`-Module). Kollabiert im Cutover-PR, sobald die Twilio-Route gelöscht wird. Bewusst, dokumentiert.
