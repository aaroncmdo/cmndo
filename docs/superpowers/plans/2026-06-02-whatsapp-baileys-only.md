# WhatsApp → Baileys (Twilio raus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Alle WhatsApp-Nachrichten (ausgehend + eingehend) laufen über den Baileys-VPS-Service; Twilio wird aus dem WhatsApp-Pfad vollständig entfernt. Twilio bleibt nur für SMS/Voice/2FA-Verify.

**Architecture:** Outbound migriert am **Leaf** (`sendWhatsApp()` in `src/lib/whatsapp.ts`) — alle Caller (manual, status, templates, reminder, mahnungen) fließen dadurch automatisch über Baileys, ohne dass ein Call-Site-File angefasst wird (kein Kollisionsrisiko mit `termin-engine`/`embed-b`-Sessions). Inbound wird in die bestehende Baileys-Route `/api/baileys/inbound` portiert: Text-Intents (JA/NEIN, embed-B-Resolution, Termin-Bestätigung, Umtermin) rufen **dieselben Shared-Helper** wie die Twilio-Route (`matchInboundToFall`, `closeNurGutachterTerminAlsDurchgefuehrt`, `createEmbedBKlaerungTask`) — die Twilio-Route bleibt unangetastet. Medien-Inbound ist **infra-gated** (Baileys-Worker liefert noch keine Medien-Bytes) → Contract definiert + defensive Degradation.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (service-role), Baileys-Service (VPS, `BAILEYS_BASE_URL`), vitest.

**Scope-Lock (Aaron 2026-06-02):** „Voll jetzt (Outbound + Inbound-Port)" + „Twilio-WA komplett raus" (Baileys-only, KEIN Twilio-Fallback; Email-Fallback bleibt wo er existiert).

---

## Provider-Status (Audit 2026-06-02)

- **Outbound-Leaf** = `src/lib/whatsapp.ts:sendWhatsApp` (Twilio `messages.create`). EINZIGER Twilio-Send-Punkt; alles andere baut darauf auf.
- **Templates bereits dormant:** `WHATSAPP_USE_TEMPLATES` default-off → `sendWhatsAppTemplate` fällt schon heute auf Legacy-Text → `sendWhatsApp`. Content-API-Zweig ist toter Code.
- **Baileys-Leaf** = `src/lib/whatsapp/baileys-client.ts:sendWhatsAppText` (produktionsreif, `{ok,...}`-Union). Bereits live für Magic-Links.
- **Inbound-Route Baileys** = `src/app/api/baileys/inbound/route.ts` (existiert, Text→`nachrichten`-Stub, Dedup via `external_message_id`, Lead/Fall-Match). FEHLT: Intents, embed-B, Termin, Medien.
- **Twilio-Inbound** = `src/app/api/webhooks/twilio/inbound/route.ts` (~745 Z., reich: Intent + embed-B + ZB1/Polizei-OCR + `fall_dokumente`; Medien via Twilio-CDN-`fetch` mit Basic-Auth). **Gehört der aar-939-Session — NICHT anfassen.**

## CODE (jetzt) vs INFRA (Aaron/VPS, danach)

- **CODE jetzt:** Task A–D unten.
- **INFRA danach (Aaron):** Baileys-Worker muss Inbound (inkl. Medien-Upload→Storage) an `/api/baileys/inbound` posten; WA-Nummer am Baileys-Worker; `BAILEYS_BASE_URL`/`BAILEYS_AUTH_TOKEN` im VPS-`.env.local`; Port-Klärung (Code-Default `3055` vs Memory `4001`). **Cutover-Cleanup** (Twilio-Routen löschen, `TWILIO_WHATSAPP_FROM` raus, Datenschutz final) = separater PR NACH bestätigtem Infra-Cutover.

---

## File Structure

| Datei | Verantwortung | Task |
|---|---|---|
| `src/lib/whatsapp.ts` (modify) | `sendWhatsApp`-Leaf → Baileys; `sendStatusWhatsApp` Twilio-Fallback + Template-Zweig raus; `NACHRICHT_TO_TEMPLATE` (dead) löschen | A |
| `src/lib/whatsapp/send-template.ts` (modify) | Twilio-Content-API-Block raus → immer Legacy-Text via `sendWhatsApp` (Baileys); `provider: 'baileys'` | A |
| `src/lib/notifications/channels/whatsapp.ts` (modify) | Header-Kommentar + Fehlertext Twilio→WhatsApp; Logik unverändert (fließt über A) | A |
| `src/lib/whatsapp/__tests__/send-leaf.test.ts` (create) | `sendWhatsApp` ruft Baileys, nicht Twilio | A |
| `src/app/api/baileys/inbound/route.ts` (modify) | + Intent-Detection, embed-B-Resolution, Termin-Bestätigung, Umtermin-Notification (Shared-Helper); + Medien-Handler (Contract + defensiv) | B, C |
| `src/lib/inbound/process-inbound-text.ts` (create) | Provider-neutrale Text-Intent-Verarbeitung (von Baileys-Route genutzt) | B |
| `src/lib/inbound/process-inbound-media.ts` (create) | Provider-neutrale Medien-Verarbeitung (Bytes→ZB1-OCR/Polizei/`fall_dokumente`) | C |
| `src/lib/inbound/__tests__/process-inbound-text.test.ts` (create) | JA→Termin bestätigt; embed-B stale NEIN→Klärungs-Task | B |
| `docs/02.06.2026/whatsapp-baileys-only.md` (create) | Build+Verifikation+Infra-Cutover-Checkliste | D |
| `src/content/legal/datenschutz.md` (modify, DRAFT) | WA-Abschnitt: Twilio→Baileys-Direktverbindung — **mit `<!-- LEGAL-REVIEW -->`-Marker** | D |

**Twilio-WA-Routen bleiben (deprecation-Kommentar, NICHT löschen):** `api/webhooks/twilio/inbound`, `api/webhooks/twilio/status`, `api/twilio/inbound-kb-whatsapp`, `lib/twilio/provision-kb-nummer.ts`. Löschung = Cutover-PR.

---

### Task A: Outbound-Leaf → Baileys

**Files:** modify `src/lib/whatsapp.ts`, `src/lib/whatsapp/send-template.ts`, `src/lib/notifications/channels/whatsapp.ts`; create `src/lib/whatsapp/__tests__/send-leaf.test.ts`

- [ ] **A1: `sendWhatsApp` (Leaf) auf Baileys umschreiben** — behält `{success,sid?,error?}`-Signatur (Caller unverändert). Twilio-Block raus. Normalisierung → E.164 (`+49…`), `whatsapp:`/Sonderzeichen strippen, dann `sendWhatsAppText`.

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppText } from './whatsapp/baileys-client'

// ─── WhatsApp-Versand (Baileys, VPS-Worker) ──────────────────────────────────
// 2026-06-02: Twilio-WhatsApp vollständig entfernt — alle ausgehenden WhatsApp-
// Nachrichten laufen über den Baileys-Service. Twilio nur noch SMS/Voice/2FA-Verify.

/** Sendet eine WhatsApp-Text-Nachricht über den Baileys-VPS-Service.
 *  Behält die {success,sid,error}-Signatur, damit Caller unverändert bleiben. */
export async function sendWhatsApp(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  let cleanTo = (to ?? '').replace(/[^0-9+]/g, '')
  if (cleanTo.startsWith('00')) cleanTo = '+' + cleanTo.slice(2)
  else if (cleanTo.startsWith('0')) cleanTo = '+49' + cleanTo.slice(1)
  else if (!cleanTo.startsWith('+')) cleanTo = '+49' + cleanTo
  if (cleanTo.length < 7) return { success: false, error: 'Keine gültige Telefonnummer' }

  const result = await sendWhatsAppText(cleanTo, message)
  if (result.ok) return { success: true, sid: result.messageId ?? undefined }
  console.error(`[whatsapp] Baileys send failed (${result.code}): ${result.error}`)
  return { success: false, error: result.error }
}
```

- [ ] **A2: `sendStatusWhatsApp` vereinfachen** — Template-Zweig (`if (sid && tplName)`) + Twilio-Fallback-Block entfernen; Send über den neuen Leaf. `NACHRICHT_TO_TEMPLATE`-Map + `import type { TemplateName }` löschen (nur dort genutzt → dead). Ersatz für den `if (telefon){…}`-Block:

```ts
if (telefon) {
  const sendResult = await sendWhatsApp(telefon, nachricht)
  if (!sendResult.success) {
    supabase.from('timeline').insert({
      fall_id: fallId, typ: 'system',
      titel: 'WhatsApp-Versand fehlgeschlagen',
      beschreibung: `Nachricht an ${telefon} konnte nicht gesendet werden: ${sendResult.error ?? 'unbekannt'}`,
    }).then(() => {})
  }
}
```

- [ ] **A3: `send-template.ts` Baileys-only** — Twilio-Content-API-Block (`if (contentSid && templatesEnabled){…}`) komplett raus; immer Legacy-Text via `sendWhatsApp`. `getTemplateSid`-Import entfernen, `absender_kb_id`→`_absender_kb_id`, Rückgabe `provider: 'baileys'`. **Vorher prüfen:** `grep -rn "\.provider" src/` — kein Consumer darf auf `'twilio-template'|'twilio-legacy'` schalten (Notifications-Channel liest nur `.success/.sid/.error`).

```ts
import { type TemplateName } from './template-sids'
import { getLegacyTemplateText } from './legacy-texts'
import { sendWhatsApp } from '../whatsapp'

// 2026-06-02: WhatsApp läuft vollständig über Baileys (Text-only). Genehmigte
// Twilio-Content-Templates entfallen — jede Nachricht geht als gerenderter
// Legacy-Text über den Baileys-Service.
export async function sendWhatsAppTemplate(
  to: string,
  templateName: TemplateName,
  variables: Record<string, string>,
  _absender_kb_id?: string,
  locale: string = 'de',
): Promise<{ success: boolean; sid?: string; error?: string; provider: 'baileys' }> {
  const legacyText = getLegacyTemplateText(templateName, variables, locale)
  if (!legacyText) {
    console.warn(`[whatsapp] Kein Text für Template '${templateName}', skip`)
    return { success: false, error: 'no_legacy_text', provider: 'baileys' }
  }
  const result = await sendWhatsApp(to, legacyText)
  return { ...result, provider: 'baileys' }
}
```

- [ ] **A4: notifications/channels/whatsapp.ts** — Header-Kommentar Twilio→Baileys; `errorMessage: result.error ?? 'twilio send failed'` → `'whatsapp send failed'`. Sonst unverändert.

- [ ] **A5: Test** `send-leaf.test.ts` — mock `./whatsapp/baileys-client` (`sendWhatsAppText`), assert `sendWhatsApp('0151...', 'hi')` ruft `sendWhatsAppText` mit `+49151...` und mappt `{ok:true,messageId:'x'}`→`{success:true,sid:'x'}`; `{ok:false,...}`→`{success:false}`. Kein `twilio`-Import erwartet.

- [ ] **A6:** `npx tsc --noEmit` grün · `vitest run src/lib/whatsapp` grün · commit.

---

### Task B: Inbound Text-Intents → Baileys-Route

**Files:** create `src/lib/inbound/process-inbound-text.ts` + test; modify `src/app/api/baileys/inbound/route.ts`

Provider-neutrale Verarbeitung, die die **bestehenden Shared-Helper** ruft (faithful Port aus der Twilio-Route, ohne diese zu editieren).

- [ ] **B1: `process-inbound-text.ts`** — Export `detectIntent(body: string): Intent` und `processInboundText(db, { fromPhone, body, intent }): Promise<{ handled: boolean }>`. Logik 1:1 portiert aus Twilio-Route Z.139-336:
  - `detectIntent`: `dokument_upload` (nur wenn Medien — hier ohne Medien also nie), `termin_bestaetigung_ja` (JA/OK/BESTAETIGT/BESTÄTIGT/JAA), `termin_bestaetigung_nein` (NEIN/…), `umtermin` (VERSCHIEBEN/UMTERMIN/ANDEREN TERMIN), sonst `unknown`.
  - `matchInboundToFall(db, fromPhone)` → `match` (leadId/fallId/candidates).
  - **embed-B-Resolution** (Z.174-291): bei JA/NEIN + (fallId|leadId) → stale `nur_gutachter`-Termin via dasselbe Stale-Gate (`TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE`, `< end_zeit`, durchgefuehrt/no_show/ablehnung NULL, Claim nicht `CLAIM_TERMINAL_STATUSES`) → JA: `closeNurGutachterTerminAlsDurchgefuehrt` + Timeline + `sendCommunication('chat_fallback_kunde',…)`; NEIN: `createEmbedBKlaerungTask` + Timeline + Reply. `return { handled: true }`.
  - **Termin-Bestätigung** (Z.294-312): matchedFallId + JA + nächster Zukunfts-Termin → `gutachter_termine.status='bestaetigt'` (guard `.in(['reserviert','angefragt'])`) + Timeline + Reply.
  - **Nein/Umtermin** (Z.314-336): matchedFallId → `createNotification(kb,'kunde-termin-abgelehnt',…)` (KB via `claims:claim_id(kundenbetreuer_id, claim_nummer)`-Embed, Array-normalisiert) + Reply.
  - Alle Sub-Sends/Inserts non-critical (`.catch(()=>{})`).

- [ ] **B2: Route-Integration** — in `route.ts` nach dem `nachrichten`-Insert: `const intent = detectIntent(text); if (intent !== 'unknown') await processInboundText(db, { fromPhone: phone, body: text, intent }).catch(e => console.error('[baileys/inbound] text-intent:', e))`. Lead/Fall-Match der Route auf `matchInboundToFall` vereinheitlichen (statt lokalem phoneVariants-Match) — `normalizePhoneVariants` nur behalten falls noch genutzt.

- [ ] **B3: Test** `process-inbound-text.test.ts` — mock supabase-admin + die Shared-Helper. (1) JA + Zukunfts-Termin → `gutachter_termine.update({status:'bestaetigt'})` aufgerufen. (2) JA + stale `nur_gutachter` → `closeNurGutachterTerminAlsDurchgefuehrt` aufgerufen, früh-`handled:true`. (3) NEIN + stale → `createEmbedBKlaerungTask`.

- [ ] **B4:** `tsc --noEmit` · `vitest run src/lib/inbound` · commit.

---

### Task C: Inbound Medien-Handler (Contract + defensiv)

**Files:** create `src/lib/inbound/process-inbound-media.ts`; modify `src/app/api/baileys/inbound/route.ts`

**Worker-Contract (Aaron muss erfüllen):** Bei Medien lädt der Baileys-Worker die Datei selbst in den `fall-dokumente`-Bucket und postet:
```ts
media?: Array<{ storage_path: string; mime: string; filename?: string }>
```
(Alternativ `url` für unauth. Fetch.) App lädt die Bytes via `db.storage.from('fall-dokumente').download(storage_path)`.

- [ ] **C1: `process-inbound-media.ts`** — Export `processInboundMedia(db, { fromPhone, leadId, fallId, candidates, media })`. Portiert die Routing-Logik der Twilio-Route (Z.338-734), aber Bytes-Quelle = Storage (worker-uploaded) statt Twilio-CDN:
  - **Bytes laden:** `download(storage_path)` → Buffer; bei `url` → `fetch(url)` (kein Basic-Auth).
  - **Lead-ZB1** (zb1_status offen): erstes Bild → `runZB1Ocr(buf.toString('base64'))` → `leads`-Felder (fin/kennzeichen/halter/hsn/tsn …) wie Z.565-592 + `syncDokumentUploadAnfrage(db,leadId,'fahrzeugschein',url)` + Dispatcher-Notification. (Cardentity NICHT auto — manuell, s. Twilio-Route Z.594.)
  - **Lead-Polizei** (polizeibericht_status offen, jüngere Anfrage gewinnt): Bild → Status `hochgeladen` + `scheduleBkatAnalyseAfterUpload` + Notification.
  - **Mehrfachbild-Fallback** (beide bereits hochgeladen): generischer Lead-Anhang + Dispatcher-Notification.
  - **Fall-Pfad:** `fall_dokumente`-Row (`quelle:'whatsapp'`, `sichtbar_fuer:['admin','kundenbetreuer','sachverstaendiger','kanzlei','kunde']`) + KB-Notification + Timeline.
  - `syncDokumentUploadAnfrage` als lokalen Helper hier neu (Twilio-Route behält ihren — transitional, bis Cutover; Kommentar setzen).
- [ ] **C2: Route-Integration + Degradation** — Contract um `media?: […]` erweitern. Wenn `Array.isArray(media) && media.length` → `processInboundMedia(...)`. Wenn nur `has_media:true` ohne `media[]` → bestehender `nachrichten`-Insert mit `hat_anhang:true` (bereits da) **plus** Dispatcher-Notification „Medien-Nachricht eingegangen — Worker liefert noch keine Datei-Bytes" (kein stiller Verlust). Klartext-Kommentar: Medien-Pfad scharf erst nach Worker-Contract.
- [ ] **C3:** `tsc --noEmit` · commit. (E2E-Medien-Smoke erst nach Worker-Infra möglich — dokumentieren.)

---

### Task D: Docs, Deprecation-Marker, Datenschutz-Draft

**Files:** create `docs/02.06.2026/whatsapp-baileys-only.md`; deprecation-Kommentar in den 4 Twilio-WA-Files; modify `src/content/legal/datenschutz.md`

- [ ] **D1:** Deprecation-Kommentar-Kopf in `api/webhooks/twilio/inbound/route.ts`, `api/webhooks/twilio/status/route.ts`, `api/twilio/inbound-kb-whatsapp/route.ts`, `lib/twilio/provision-kb-nummer.ts`: „DEPRECATED 2026-06-02: WhatsApp läuft über Baileys (`/api/baileys/inbound`). Diese Route bleibt bis zum infra-seitigen Cutover; Löschung im Cutover-PR. Nicht erweitern." (Keine Logikänderung → keine Kollision.)
- [ ] **D2:** `datenschutz.md` Z.325-328 (WA-Abschnitt) — Draft-Umschrift Twilio-WABA → „WhatsApp-Versand über eine selbst-gehostete Baileys-Verbindung (kein Twilio-Subprozessor mehr)", mit `<!-- LEGAL-REVIEW erforderlich: Baileys ist eine inoffizielle WhatsApp-Anbindung; Datenfluss/Subprozessor-Beschreibung von Aaron/Legal final prüfen -->`.
- [ ] **D3:** `docs/02.06.2026/whatsapp-baileys-only.md` — Was migriert, CODE-vs-INFRA, Worker-Contract (Medien), Cutover-Cleanup-Checkliste (Twilio-Routen löschen, `TWILIO_WHATSAPP_FROM` raus, Datenschutz final, `provision-kb-nummer` Fate), Verifikations-Status.

---

## Verifikation (vor PR)

- **Build-Gate:** `npx tsc --noEmit` grün; **`npm run build`** grün (Route-/Server-Action-Validierung — fing P2a-Fehler den tsc verpasste). `npm run check:token-audit` + `check:component-set` 0 neu.
- **Unit:** `vitest run src/lib/whatsapp src/lib/inbound` grün (Outbound-Leaf + Text-Intents).
- **Inbound-Daten-Smoke (optional, Live-DB):** synthetisches JA/NEIN über `processInboundText` gegen Test-Lead/-Termin → Termin `bestaetigt` bzw. embed-B-Klärungs-Task. (Worker-Transport NICHT smokebar lokal.)
- **Outbound-Versand-Smoke:** NICHT lokal möglich (Baileys-Worker = VPS-localhost). Funktioniert in Staging sobald `BAILEYS_BASE_URL` gesetzt.

## Selbst-Review-Notizen

- **Regel 1:** Branch `kitta/whatsapp-baileys-only` off staging, PR gegen staging, kein Self-Merge.
- **Keine DDL** → Regel 2 n/a.
- **Kollision:** Twilio-Route + termin-actions UNANGETASTET (Leaf-Migration + additive Baileys-Route) → kein Trample mit aar-939/termin-engine.
- **DRY-Transitional:** `syncDokumentUploadAnfrage` + Intent-Logik temporär doppelt (Twilio-Route + neue Shared-Module); kollabiert im Cutover-PR wenn die Twilio-Route stirbt. Dokumentiert.
