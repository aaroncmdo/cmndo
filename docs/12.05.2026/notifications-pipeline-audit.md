# Notifications-Pipeline Audit

**Datum:** 2026-05-12
**Scope:** Event-Emitter → Worker → Channel-Router → Reader-Sicht + Preferences/Push
**Methodik:** DB-Stats via Supabase MCP + 3 parallele Subagent-Tiefenbohrungen (Fan-Out / Reader / Preferences)

---

## TL;DR

Die Pipeline existiert architektonisch sauber (AAR-497 N2 Worker mit FOR UPDATE SKIP LOCKED + Retry-Backoff, AAR-500 N5 Preferences mit Quiet-Hours, AAR-499 N4 Web-Push, AAR-764 Mitteilungs-Resolver). **Real eingesetzt wird sie aber nur bruchstückhaft:**

| Befund | Schwere |
|---|---|
| **Email läuft komplett am Pipeline-System vorbei** — 265 `email_log`-Rows, 0 in `notification_deliveries.email` | 🔴 |
| **`fall.created` Event-Drift** — nur 2 Events bei 8 Fällen, andere Anlage-Pfade emitten nicht | 🔴 |
| **3 parallele Tabellen** — `benachrichtigungen` (662, alt) wird beschrieben aber nicht mehr gelesen | 🟠 |
| **Web-Push tot ausgerollt** — VAPID-Keys fehlen, kein Subscribe-Flow, 0 Subscriptions, 33 skipped | 🟠 |
| **Preferences-System unbenutzt** — UI in 3 Portalen vorhanden, aber 0 von 34 Profilen gepflegt | 🟠 |
| **Twilio-Status-Webhook fehlt** — WhatsApp-Status bleibt für immer auf `sent` | 🟡 |
| **Worker-Bug** — Dead-Letter-Zustand existiert nicht, nach 4 Retries bleibt es `failed` ohne Unterscheidung | 🟡 |
| **Retry-Logic-Tippfehler** — `process/route.ts:147` setzt in beiden Branches `'failed'` | 🟡 |

**Kernaussage:** Die Pipeline ist als Ringkern da, aber 60 % des realen Notification-Verkehrs umgehen sie. Insbesondere Email-Flows wurden nie integriert — `sendKundeWelcome()`, `sendSvAuftrag()` etc. schreiben direkt in `email_log`, ohne Event-Emit. Dadurch funktionieren Quiet-Hours, Opt-Outs und Audit-Trail für Emails überhaupt nicht.

---

## DB-Stats (Snapshot 2026-05-12)

| Tabelle | Rows | Erste | Letzte |
|---|---:|---|---|
| `notification_events` | 56 | 2026-04-27 | 2026-05-08 |
| `notification_deliveries` | 179 | 2026-05-06 | 2026-05-08 |
| `benachrichtigungen` | 662 | 2026-04-11 | 2026-05-11 |
| `mitteilungen` | 98 | 2026-05-06 | 2026-05-09 |
| `nachrichten` | 2 | 2026-05-06 | 2026-05-07 |
| `notification_preferences` | **1** (von 34 Profilen) | — | — |
| `push_subscriptions` | **0** | — | — |
| `email_log` | 265 | 2026-04-15 | 2026-05-09 |

**`notification_events` Status-Verteilung:** alle 56 = `completed` (kein `pending`/`failed` aktuell)

**`notification_deliveries` Channel × Status:**
- `in_app`: 113 sent
- `web_push`: 33 skipped (keine Subs)
- `whatsapp`: 33 sent
- `email`: **0** ← der zentrale Drift

**Top Event-Types:** `termin.sv_angekommen` (32), `gutachten.pflicht_fotos_unvollstaendig` (17), `fall.created` (2), `sa.signed` (2), 2 weitere

---

## A) Event-Emitter (21 Call-Sites)

### Top-Stellen
- `src/app/flow/[token]/actions.ts` — `fall.created`, `sa.signed`
- `src/lib/faelle/state-machine.ts` — `status_changed`, `storniert`, `kanzlei.uebergabe`, `regulierung.ergebnis` (zentrale Achse)
- `src/lib/actions/termin-actions.ts` — `termin.*`
- `src/lib/claims/endzustand-actions.ts` — `claim.reguliert/abgelehnt`
- `src/lib/gutachten/ocr-actions.ts` — `gutachten.ocr_succeeded/failed`

### 🔴 Drift `fall.created`
Nur **2 Events bei 8 Fällen** in der DB. Emit nur in `flow/[token]/actions.ts` (Self-Dispatch-Funnel). Andere Anlage-Pfade — Admin (`/admin/faelle/anlegen`), Import-Skripte — feuern **kein** `fall.created`.

**Folge:** Channel-Matrix definiert für `fall.created` `[whatsapp, email, in_app]` an Kunde — bei 6 von 8 Fällen wurde nichts versendet.

**Fix-Ort:** `state-machine.ts` oder `createFall()`-Helper als Single-Point-of-Emission.

---

## B) Worker

### Implementation
- `src/app/api/notifications/process/route.ts`
- POST = fire-and-forget Trigger, GET = Cron-Fallback alle 5 Min (Vercel-Cron — laut Memory inzwischen VPS-Cron)
- Pattern: `FOR UPDATE SKIP LOCKED` ✅
- Retry-Backoff: 1 min → 5 min → 30 min → 2 h → "dead-letter" (max 4)

### 🟡 Bugs
- **Status-Schema:** Nur 3 Werte (`pending`, `processing`, `completed`) — kein `failed` oder `dead_letter` separat
- **Logic-Tippfehler `process/route.ts:147`:**
  ```ts
  const finalStatus = nextRetry ? 'failed' : 'failed'  // beide Branches identisch
  ```
  → Dead-Letter-Status nie erreicht, alle Retry-Failures landen einfach in `failed`
- Ein "alle 56 = completed" liest sich gesund — heißt aber auch: kein einziger Failure dokumentiert. Bei realem Volumen wäre das verdächtig.

### Health-Bewertung
- Volumen: 56 Events in 12 Tagen ≈ 4-5/Tag — passt zum aktuellen Test-/Live-Hybrid-Stand
- Kein Backlog — Worker arbeitet schneller als Events reinkommen

---

## C) Channel-Router

### Implementation
- `src/lib/notifications/fan-out.ts` — `computeRecipients()` × `EVENT_MATRIX`
- `src/lib/notifications/preferences.ts` — `decideDeliveries()` filtert per User/Channel
- Sonderfälle: `task.*`, `makler.*`, `dokument.hochgeladen`, `nachricht.received` haben Custom-Fan-Out

### Channel-Status

| Channel | Handler | Status | Bewertung |
|---|---|---|---|
| `in_app` | ✅ registriert | 113 sent | OK |
| `whatsapp` | ✅ via `sendWhatsAppTemplate()` | 33 sent | OK (aber kein Status-Update, siehe D) |
| `web_push` | ✅ Handler da | 33 skipped (`no_active_subscription`) | tote Pipeline (siehe Preferences-Audit) |
| `email` | ✅ Handler in `CHANNEL_HANDLERS` registriert | **0 deliveries** | **🔴 Pipeline-Bypass** |

### 🔴 Email-Bypass im Detail
- Pipeline-Handler `src/lib/notifications/channels/email.ts` würde funktionieren — löst Templates auf, ruft `sendEmail()` auf
- **ABER:** 70 direkte `sendEmail()`-Aufrufe aus Server-Actions umgehen die Pipeline:
  - `src/lib/email/google/flows.ts` — `sendKundeWelcome()`, `sendSvAuftrag()`, 7 Funktionen
  - Diese rufen `sendEmail()` direkt auf, ohne Event-Emit
  - `sendEmail()` schreibt nur in `email_log`, **nicht in `notification_deliveries`**
- Resultat: 265 Email-Sends im Log, 0 in der Pipeline-Audit-Tabelle. Quiet-Hours + Opt-Outs greifen für Emails **null**.

**Konsolidierungs-Optionen:**
- (a) Direkte `sendEmail()`-Calls auf Pipeline-Emit umstellen — sauber, aber Refactor von 70 Call-Sites
- (b) `email_log` → `notification_deliveries`-Bridge bauen — schreibt nach jedem `sendEmail()` einen `delivery`-Eintrag (kann via Trigger oder im `sendEmail()`-Helper)
- (c) Hybrid: Neue Email-Flows nur via Pipeline; Legacy-Flows graten

---

## D) Twilio-Status-Webhook (fehlt komplett)

- `src/app/api/webhooks/twilio/inbound/route.ts` empfängt **nur** Inbound-Messages (Kunde→System)
- Keine Status-Callback-Route gefunden
- Twilio sendet `queued → sent → delivered → read`-Status-Updates → werden **nicht empfangen**
- → `notification_deliveries.status` bleibt für WhatsApp ewig auf `sent`, kein Read-Receipt-Flag

**Folge:** Admin sieht "33 sent", weiß aber nicht ob davon 0, 5 oder 33 wirklich gelesen wurden.

---

## E) Reader-Sicht (drei Tabellen, eine wird ignoriert)

### `mitteilungen` (98) — Hauptkanal
- **Schreiber:** `createGutachterMitteilung()` in `src/lib/mitteilungen.ts`
- **Leser:** `useMitteilungen()` Hook in `UpdatesNav.tsx` (Header-Glocke, alle Portale außer Kunde)
- **Realtime:** ✅ Subscription auf INSERT+UPDATE mit `useId()`-Channel-Names (AAR-562 Bug-Fix)
- **Tabs:** Aktivität / Nachrichten / Anrufe / Kritisch (`prioritaet=dringend`)
- **Trigger-Events:** 12 verschiedene (`neuer_auftrag`, `termin_bestaetigt`, `vorschaden_warnung` (DRINGEND), `qc_nachbesserung` (DRINGEND), `kanzlei_*`, `paket_fast_voll`, `guthaben_niedrig`, etc.)

### `benachrichtigungen` (662) — Legacy, wird beschrieben aber nicht gelesen
- **Schreiber:** Alte `createNotification()` in `src/lib/notifications.ts` — **18× Aufruf-Sites** (laut RLS-Audit)
- **Leser:** Niemand mehr in `UpdatesNav` oder `useMitteilungen`
- **Folge:** 662 Rows wachsen weiter, niemand sieht sie. Cleanup-Strategie fehlt
- **Cross-Cut RLS-Audit:** "System insert" Policy ist `WITH CHECK (true)` — anonymer Insert möglich, ohne Ownership-Check

### `gutachter_mitteilungen` (Schema da, 0 Rows)
- SV-spezifisch, separat — nicht in `UpdatesNav` integriert
- Möglicher SV-Sicht-Drift — aber solange leer, kein Akut-Bug

### `nachrichten` (2) — Multi-Channel-Inbox-Chat
- Eigener Use-Case: Chat-Nachrichten in Fallakte
- `kanal` CHECK-Constraint: `chat_kb_kunde`, `chat_kunde_sv`, `gruppenchat`
- Audit-Felder für WhatsApp/Email: `external_message_id`, `template_key`, `status`
- `fall_read_state` Tabelle (0 Rows aktuell, AAR-854 Migration 2026-04-27 — vermutlich gewipt)

### Drift-Risiken
- **Doppel-Schreibung:** Wenn ein Event sowohl `createNotification` (Legacy) als auch `mitteilungen` (Neu) triggert, hängt 1 Row in jeder Tabelle. UI zeigt nur die neue.
- **Cleanup:** `benachrichtigungen` (662) und `mitteilungen` (98) wachsen monoton — keine Archivierung/Retention

---

## F) Preferences + Push

### Default-Behavior (kein Row in `notification_preferences`)
`loadPreferences()` returns `DEFAULT_PREFS`:
- `channel_opt_outs: []` (alle Kanäle aktiv)
- `event_opt_outs: {}` (keine Event-Level-Opt-Outs)
- `quiet_hours_start/end: null` (Ruhezeiten aus)
- `timezone: 'Europe/Berlin'`

→ **Alle 34 Profiles erhalten alle Default-Channels** der `EVENT_MATRIX`. Niemand hat opted out, niemand hat Ruhezeiten.

### Settings-UI vorhanden, ungenutzt
- `NotificationPreferencesForm.tsx` mit 3 Bereichen (Quiet-Hours, Channel-Opt-Outs, Event×Channel Feintuning)
- Integriert in 3 Portale: `/kunde/einstellungen`, `/gutachter/profil`, `MaklerSettings.tsx`
- 30 Events in 8 Kategorien opt-out-bar
- Trotzdem: **0 von 34 Profilen** haben jemals Preferences gesetzt → faktisch tot

### Web-Push tot
- Service-Worker `/public/sw.js` registriert (Push-Listener Zeile 76)
- **VAPID-Keys fehlen** in `.env.local` und VPS-Env → `ensureVapid()` returnt `false`
- `registerPushSubscription()` (`src/lib/actions/push-subscribe.ts`) **wird nirgends aufgerufen**
- `Notification.requestPermission()` nur in `RealtimeLeadAlert.tsx` (Dispatcher-only)
- → Kein User wird je gefragt, ob er Push will → 0 Subscriptions → 33 web_push deliveries automatisch skipped

### Quiet-Hours
- 21 Events als `urgent` klassifiziert (umgehen Quiet-Hours): termin.*, auszahlung.*, eskalation.*, claim.*, task.due, mietwagen.*, gutachten.ocr_failed
- Aber: weil niemand Quiet-Hours setzt, läuft auch nachts alles durch — Urgent-Klassifikation faktisch egal

---

## Top-Empfehlungen (priorisiert nach Impact, nur Audit-Empfehlungen — keine Fixes)

### Architektonische Konsolidierungen
1. **Email in Pipeline integrieren** — `sendEmail()`-Helper als Bridge zu `notification_deliveries`. Spec separat. Macht Audit-Trail vollständig + bringt Quiet-Hours/Opt-Outs für Emails.
2. **`fall.created` an Single-Source-of-Emission** — z.B. in `state-machine.transitionFallStatus` beim ersten Übergang in 'angelegt'. Alle Anlage-Pfade triggern dann automatisch.
3. **`benachrichtigungen` deprecaten** — `createNotification()` (18 Call-Sites) auf `mitteilungen` migrieren, alte Tabelle archivieren. Cleanup-Cron für die 662 stale Rows.

### Operative Lücken
4. **Twilio-Status-Webhook** — eine neue Route `api/webhooks/twilio/status` registrieren, Status in `notification_deliveries.status` updaten
5. **Web-Push Onboarding-Flow** — VAPID-Keys deployen, beim ersten Login Permission-Prompt + `registerPushSubscription()`
6. **Preferences-Onboarding** — beim Profil-Setup einmalig Defaults zur Bestätigung anzeigen, sonst bleibt das UI ein Friedhof

### Code-Hygiene
7. **Worker Dead-Letter-Status** — Schema-Migration: `status` enum erweitern um `dead_letter`, Logic-Tippfehler in `process/route.ts:147` fixen
8. **Cleanup-Strategie** — Retention für `notification_events`/`deliveries`/`benachrichtigungen` (z. B. 90 Tage)

### Visualisierung (was Aaron auch fragte)
9. **Admin-Dashboard "Notification-Health"** — pro Tag/Channel: emitted vs sent vs failed vs skipped, Top-Failures, Backlog-Größe
10. **Pro-User "Notifications-Trail"** — Audit pro User: was wurde wann auf welchem Channel zugestellt, Read-Status

---

## Nicht in diesem Audit

- **WhatsApp-Templates-Approval-Status** (Twilio Content-Templates)
- **Email-Template-Coverage** — welche Events haben Templates, welche fallen auf Fallback
- **Resend-vs-SMTP-Routing** in `sendEmail()` — Memory: Resend primary, SMTP fallback
- **`fall_read_state`** detail (0 Rows aktuell, möglicherweise nach Test-Wipe normal)
- **Aircall-Notifications** (`anruf_log`, `aircall_calls`) — eigene Pipeline, separates Audit lohnt
- **`support_ticket_log`** — Support-Bot-Notifications

---

## Anhang

- DB-Stats via `mcp__plugin_supabase_supabase__execute_sql` (Project `paizkjajbuxxksdoycev`)
- 3 Subagent-Tiefenbohrungen 2026-05-12
- Cross-References: `rls-permissions-audit.md` (Notifications-Ownership-Lücke), `abrechnung-audit.md` (`sv_payment_reminders` 0 Rows), `server-actions-pattern-audit.md` (Mixed-Pattern in Notification-Actions)
