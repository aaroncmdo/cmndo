# Vertikal+Horizontal Lead-Audit — 20.05.2026

**Branch:** `kitta/aar-lp-tel-format` (read-only — kein Code-Change in dieser Session)
**Methodik:** zwei parallele Explore-Agents (Vertikal-Lifecycle + Horizontal-Inventory), danach manuelle Verifikation der kritischen Befunde am Code. Zwei Agent-Befunde wurden als Falsch-Positive korrigiert (siehe §6).
**Scope:** Lead-Subsystem von Marketing-Touchpoint bis Konversion-zu-Fall (`leads`-Tabelle, alle 7 Eintrittspunkte, alle Side-Effects).

---

## TL;DR (was als Erstes ins Linear gehört)

| Prio | Befund | Datei (Ankerpunkt) |
|------|--------|-------------------|
| **P0-1** | RPC `convert_anfrage_zu_lead` schreibt `leads` ohne `source_channel`/`status` — umgeht die `createLead()`-Zentralisierung | `supabase/migrations/20260518193208_convert_anfrage_zu_lead.sql:48-56` |
| **P0-2** | Twilio-Inbound-Webhook ohne Signature-Validierung — Spoofing-fähig | `src/app/api/webhooks/twilio/inbound/route.ts:75-85` |
| **P0-3** | `lead_historie`-Tabelle existiert seit 13.05., wird aber von keinem Code beschrieben — Audit-Trail komplett leer | `supabase/migrations/20260513151701_aar_lead_historie_lock.sql` |
| **P1-1** | `createManualLead` returnt `{success}` während Caller-Pattern `{ok}` ist (zentraler `createLead` returnt `{ok}`) | `src/app/dispatch/leads/actions.ts:51` |
| **P1-2** | 3 Quellen ohne Server-side-Zod (createManualLead, createSpontanTermin, aircall-Webhook) | siehe §5.P1 |
| **P1-3** | Keine dedizierten RLS-Tests für die 6 konsolidierten `leads`-Policies (AAR-888) | `src/**/*.test.ts` (nicht gefunden) |
| **P1-4** | Mini-Wizard: Geocoding-Fehler ohne Notification an Dispatcher → unsichtbarer Datenverlust | `src/lib/actions/create-lead-from-mini-wizard.ts:108-127` |
| **P1-5** | `source_channel: string` statt Union-Type — TypeScript erzwingt nur "ist String" | `src/lib/leads/create-lead.ts:34` |

3 P0, 5 P1, 5 P2 — Details unten.

---

## §1 · Methodik

Zwei Explore-Agents parallel angesetzt mit präzisen Briefings:

- **Vertikal-Agent:** für jede Lead-Quelle den End-to-End-Trace (UI → Validierung → Server-Action → DB → Side-Effects → Status-Transition → Konversion-zu-Fall)
- **Horizontal-Agent:** Inventory in 8 Layern (DB-Schema, Types/Zod, Server-Actions, API/Webhooks, UI-Components, Notifications, Crons, Tests) + Cross-Check auf Redundanz/Inkonsistenz/Dead-Code

Anschließend habe ich vier kritische Behauptungen am Code verifiziert:

1. **Bestätigt:** RPC `convert_anfrage_zu_lead` setzt `source_channel`/`status` nicht (gelesen: Zeile 48-56 der Migration)
2. **Bestätigt:** Twilio-Webhook ohne Sig-Verify (gelesen: gesamte Route, keine `X-Twilio-Signature`-Verarbeitung)
3. **Widerlegt:** `quali-offen` sei nicht im Enum — der Kommentar in `create-lead.ts:7-9` dokumentiert das als HISTORISCHEN Bug, mit Einführung von `createLead()` gefixt. TypeScript würde sonst nicht kompilieren (Zeile 24 `type LeadStatus = Database['public']['Enums']['lead_status']`).
4. **Widerlegt:** `bg-[#25D366]` sei ein Token-Audit-Verstoß — WhatsApp-Grün ist explizit whitelisted in `src/lib/external-brand-colors.ts:16` + dokumentiert in `AGENTS.md §branding-rules`.

---

## §2 · Vertikal-Audit: 7 Lead-Quellen mit Lifecycle-Trace

### Quelle 1 — Mini-Wizard `/schaden-melden`

```
UI:       src/app/schaden-melden/MiniWizardClient.tsx (Submit)
  ↓ Zod  src/lib/flow/schemas/mini-wizard.ts (7 Pflichtfelder + DSGVO)
ACTION:   src/lib/actions/create-lead-from-mini-wizard.ts:32
  ↓ Disqualifikations-Check (schuldfrage === 'eigenverantwortung')
DB:       createLead({ source_channel: 'mini_wizard', status: 'neu' | 'disqualifiziert' })
  ↓ flow_links INSERT (72h-Token)
  ↓ Geocoding fire-and-forget (mapbox)
SIDE:     dispatchMagicLink (WhatsApp bevorzugt, Email-Fallback)
  ↓ timeline INSERT + leads UPDATE (qualifizierungs_phase='flow-versendet')
STATUS:   neu → flow-gesendet (oder disqualifiziert)
KONVERSION: indirekt — Kunde klickt Magic-Link → Flow-Wizard Phase 2-4 → signSAandCreateFall()
```

**Auffälligkeiten:**
- Disqualifikation ohne Dispatcher-Notice (silent)
- Geocoding-Failure ohne Compensation (siehe P1-4)
- Magic-Link-Send-Failure ist soft — Lead bleibt mit Status `flow-gesendet` stehen, ohne dass jemand erfährt dass der Link nie ankam

### Quelle 2 — Öffentlicher Rückruf

```
UI:       Multiple Marketing-LPs (Buttons/Popovers)
  ↓ KEIN Zod — nur Inline-Check (name >= 2, telefon >= 5)
ACTION:   src/lib/actions/public-rueckruf.ts:23 (erstelleOeffentlichenRueckruf)
  ↓ First-Dispatch-User-Lookup (kein Round-Robin)
DB:       createLead({ source_channel: input.quelle || 'rueckruf', status: 'rueckruf', zugewiesen_an: dispatchUser.id })
  ↓ admin_termine INSERT (typ='rueckruf', erinnerung_min_vorher=10)
SIDE:     mitteilungen INSERT an alle dispatch-User (fire-and-forget)
STATUS:   rueckruf
KONVERSION: Dispatcher übernimmt in /dispatch/rueckrufe
```

**Auffälligkeiten:**
- Zuweisung nach „erste(r) dispatch-Rolle aus DB" — keine Auslastungs-Balance
- Inline-Check statt Zod (P1-2)

### Quelle 3 — KFZ-Gutachter-Ads-LP

```
UI:       src/app/kfzgutachter-lp/LeadFormClient.tsx:19
  ↓ Zod  LeadSchema (name, phone, city — nur 3 Felder)
ACTION:   src/app/kfzgutachter-lp/actions.ts:26 (submitKfzgutachterLead)
  ↓ Header-Audit + UTM-Capture
DB:       anfragen INSERT (NICHT leads direkt)
  ↓ RPC   convert_anfrage_zu_lead(anfrage.id)
DB-RPC:   leads INSERT — OHNE source_channel, OHNE status (siehe P0-1)
SIDE:     benachrichtigungen INSERT + revalidatePath
STATUS:   NULL (oder DB-Default falls gesetzt) — Konsistenz-Verlust zu createLead()
KONVERSION: anfragen.lead_id wird gesetzt; Dispatcher sieht in /dispatch/anfragen
```

**Auffälligkeiten — Production-Critical:**
- RPC umgeht `createLead()`-Zentralisierung komplett
- Migration `20260518193208`:48-56 listet INSERT-Spalten explizit auf — `source_channel`/`status` nicht dabei
- Bei nicht-gesetztem DB-Default: NULL-Wert für `status` → kann Dispatcher-Filter brechen
- Zwei auskommentierte Channel-Pfade (Gutachter-Termin + Makler) mit dokumentierten Blockern (P2-1)

### Quelle 4 — Dispatch-Manual (Quick-Create)

```
UI:       src/app/dispatch/leads/page.tsx (Button „Lead anlegen") → NeuLeadDrawer
  ↓ KEIN Zod
ACTION:   src/app/dispatch/leads/actions.ts:49 (createManualLead)
  ↓ Role-Check: admin | kundenbetreuer | dispatch
DB:       createLead({ source_channel: data.source_channel, status: 'neu', zugewiesen_an: user.id })
SIDE:     revalidatePath('/dispatch/leads')
STATUS:   neu
RETURN:   { success: boolean, error?: string, leadId?: string } ← Drift zu zentralem { ok } (P1-1)
```

**Auffälligkeiten:**
- Quick-Create-Stub erlaubt leere vorname/telefon (designed)
- Result-Pattern: `{success}` — alle anderen Lead-Actions nutzen `{ok}` (P1-1)
- `source_channel` wird aus Input durchgereicht ohne Validierung (P1-5)

### Quelle 5 — Aircall-Inbound-Webhook

```
WEBHOOK:  POST /api/webhooks/aircall/inbound
  ↓ HMAC x-aircall-signature ✓
  ↓ KEIN Zod auf Body
DB:       aircall_calls UPSERT (idempotent)
MATCH:    matchInboundToFall(admin, fromNumber)
IF call.created && !leadId && !fallId:
  ↓ createLead({ source_channel: 'aircall-inbound', status: 'neu', vorname: 'Unbekannt', nachname: 'Anrufer', telefon: fromNumber })
SIDE:     createNotification (Dispatcher) — nur bei Neu-Lead
STATUS:   neu
KONVERSION: kein Auto-Convert; Dispatcher sieht Stub
```

**Auffälligkeiten:**
- HMAC ✓ (gut)
- Body-Parsing ohne Zod — kein Schaden weil Aircall-Schema stabil, aber Pattern-Drift

### Quelle 6 — Dispatch-Spontan-Termin

```
UI:       src/app/dispatch/kalender/* (SV-Picker + Zeit)
  ↓ Inline-Check (vorname/nachname/telefon Pflicht)
ACTION:   src/app/dispatch/kalender/_actions/spontan.ts:46 (createSpontanTermin)
DB:       createLead({ source_channel: 'dispatch_spontan', status: 'quali-offen', service_typ: 'nur_gutachter', besichtigungsort_* })
  ↓ reserveSvTerminForLead → gutachter_termine INSERT (Status 'reserviert' + Conflict-Check)
SIDE:     sendFlowLinkMultiChannel (WhatsApp|SMS|Email|kein) — fire-and-forget
STATUS:   quali-offen
KONVERSION: Termin fest; SV bekommt Notification; Kunde optional Flow-Link
```

**Auffälligkeiten:**
- Flow-Link-Send ohne Retry — Failure silent
- Inline-Check statt Zod (P1-2)
- HISTORISCH: nutzte ungültigen Enum-Wert `qualifizierung` (Kommentar in `create-lead.ts:7-9`); inzwischen mit `quali-offen` gefixt

### Quelle 7 — Admin-Direct (anlegeFall)

```
UI:       src/app/admin/faelle/anlegen/* (Form vorname/nachname/telefon + Schaden-Felder)
  ↓ Inline-Check (vorname/nachname/telefon/schadens_plz Pflicht)
ACTION:   src/app/admin/faelle/anlegen/actions.ts:34 (anlegeFall)
DB:       createLead({ source_channel: 'admin-direkt', status: 'neu', qualifizierungs_phase: 'konvertiert', zugewiesen_an: user.id })
  ↓ SOFORT convertLeadToClaim({ leadId, kundenbetreuerId })
    ↓ claims INSERT + faelle INSERT + Pflichtdokumente + Kundenbetreuer + Konversions-Tasks
STATUS:   neu (Lead) → Fall-Status
KONVERSION: synchron im selben Action-Call
```

**Auffälligkeiten:**
- `qualifizierungs_phase: 'konvertiert'` hardcoded
- Konversion synchron — kein Background-Job
- Inline-Check statt Zod (P1-2)

---

## §3 · Horizontal-Audit: Inventory (8 Layer, kompakt)

### 3.1 DB-Schema

**Tabelle `leads`** — 201 Spalten (Hauptfelder: Kontakt, Fahrzeug, Schaden, Qualifizierung, Timestamps, FK-Backrefs auf faelle/claims/aircall_calls/anfragen/tasks).

**Enum `lead_status`** — `neu | rueckruf | quali-offen | flow-gesendet | umgewandelt | umgewandelt-sv | disqualifiziert | kalt`.

**RLS (6 konsolidierte Policies seit AAR-888, Migration 20260513164830):**
- `leads_staff_all_consolidated` (ALL) — admin + dispatch + KB-via-Fall
- `leads_kanzlei_kb_select_consolidated` (SELECT) — Kanzlei + KB-via-Claim
- `leads_makler_sv_select_consolidated` (SELECT, authenticated) — Makler + SV Fall-scoped
- `lead_historie_service_only` — nur service_role
- frühere wide-open anon-Policies gelöscht

**Trigger/Functions:**
- `trg_leads_lead_nummer` — Auto `lead_nummer` beim INSERT
- `mark_expired_leads()` — RPC: Auto-Disqualifikation nach 7 Tagen
- `convert_anfrage_zu_lead(uuid)` — Atomic Anfrage→Lead (SECURITY DEFINER + FOR UPDATE-Lock)

**Wichtige Migrations (Auswahl):**
- `20260420211923_aar630_fall_fehlende_lead_spalten.sql`
- `20260422013509_aar715_sv_leads_rls.sql`
- `20260426090000_aar829_extend_leads_for_claim_konversion.sql`
- `20260513164830_aar_leads_policy_consolidation.sql`
- `20260514131153_add_whatsapp_check_to_leads.sql`

### 3.2 TypeScript-Types & Zod-Schemas

- `src/lib/supabase/database.types.ts` — generierte Row/Insert/Update (`supabase gen types`)
- `src/lib/leads/create-lead.ts:33-40` — `LeadBase` (source_channel + status Pflicht via Typ) + `LeadExtra`
- `src/lib/actions/gutachter-finder-actions.ts` — `SvLeadPublic`
- `src/lib/dispatch/karte/types.ts` — `UnlocalizedLead`, `RawLeadForKarte`, `TriageLeadPin`
- `src/lib/email/lead-reminders.ts` — `ReminderLead`
- `src/app/kfzgutachter-lp/actions.ts:18-22` — `LeadSchema` (Zod: name/phone/city)
- `src/lib/flow/schemas/mini-wizard.ts` — Mini-Wizard-Schema (7 Felder + DSGVO)
- `src/lib/flow/fehlende-felder.ts` — `LeadConditions` (Flow-Komplettheit)

### 3.3 Server-Actions (Writers/Readers)

**Zentrale (alle Eintrittspunkte sollen hier durch):**
- `src/lib/leads/create-lead.ts:57-80` — `createLead()` (Compile-Time-Erzwingung)

**Konversion:**
- `src/lib/leads/convert-lead-to-fall.ts` — `convertLeadToFall()` (delegiert)
- `src/lib/leads/convert-lead-to-claim.ts` — `convertLeadToClaim()` (Claim-SSoT-Pfad)
- `src/lib/actions/dispatch-fall-actions.ts` — `updateLeadStatus()` + Konversions-Trigger

**Phase-spezifische (Dispatch-Detail-Page):**
- `src/app/dispatch/leads/[id]/_actions/*` — bkat-inference, cardentity, dokumente-anfordern, flowlink, email-sv-check

**Quellen-Actions:**
- `src/app/dispatch/leads/actions.ts:49` — `createManualLead`
- `src/app/flow/[token]/actions.ts` — Kunde-Flow-Erfassung
- `src/lib/actions/public-rueckruf.ts:23` — Öffentlicher Rückruf
- `src/lib/actions/create-lead-from-mini-wizard.ts:32` — Mini-Wizard
- `src/lib/actions/konvertiere-anfrage-zu-fall.ts` — Anfrage→Fall

### 3.4 API-Routes & Webhooks

**Lead-erzeugend:**
- `src/app/api/webhooks/aircall/inbound/route.ts:84` — Auto-Lead bei Inbound-Call (HMAC ✓)
- `src/app/api/webhooks/twilio/inbound/route.ts:75` — WA/SMS-Inbound (**KEIN Sig-Verify** — siehe P0-2)
- `src/app/api/webhooks/twilio/status/route.ts` — SMS-Status-Update
- `src/app/api/webhooks/lexdrive/route.ts` — LexDrive (Lead-relevant nach Memory)

**Crons:**
- `src/app/api/cron/dispatch-lead-alert/route.ts:11-55` — 5-Min-Alert auf `qualifizierungs_phase='neu'` > 5 min
- `src/app/api/cron/send-lead-reminders/route.ts:1-100` — Reminder-Kaskade (2h/24h/72h + 7d-Disqualifikation via `mark_expired_leads()`)

**Andere (Lead-lesend/seedend):**
- `src/app/api/admin/create-test-fall/route.ts`
- `src/app/api/admin/test/cmm48-smoke/route.ts`
- `src/app/api/seed-testdata/route.ts`

### 3.5 UI-Components

**Forms:**
- `src/app/kfzgutachter-lp/LeadFormClient.tsx` — Marketing-LP
- `src/app/schaden-melden/MiniWizardClient.tsx` — Mini-Wizard
- `src/components/shared/stammdaten/LeadSchemaFields.tsx`

**Display:**
- `src/app/dispatch/leads/page.tsx` — Lead-Liste
- `src/app/dispatch/leads/[id]/page.tsx` + `DispatchShell.tsx` + `PhaseContent.tsx` + `PhaseHeader.tsx` — Detail-Shell
- `src/app/dispatch/leads/[id]/_phases/*` — Phase 1-6 (PersonenForm, TerminServiceTyp, Stammdaten, Zusammenfassung, StatusTracking)
- `src/app/dispatch/leads/_components/LeadsViewToggle.tsx`
- `src/app/dispatch/leads/_components/NeuLeadDrawer.tsx`
- `src/app/dispatch/karte/LeadPopup.tsx`
- `src/components/makler/MaklerLeadsTable.tsx`

### 3.6 Notifications & Templates

- `src/lib/email/google/templates/LeadReminder1.tsx` / `LeadReminder2.tsx` / `LeadReminder3.tsx` — Reminder-Kaskade
- `src/lib/email/google/templates/FlowLinkVersand.tsx` — Magic-Link
- `src/lib/email/lead-reminders.ts` — `sendLeadReminderEmail()`
- `src/lib/communications/send-fall.ts` — Fall-Event-Mails nach Konversion
- WhatsApp via `src/lib/communications/whatsapp.ts` (Twilio-basiert; Baileys-Worker laut Memory in Planung — `project_baileys_whatsapp`)

### 3.7 Cron / Background-Jobs

- `dispatch-lead-alert` (5 min)
- `send-lead-reminders` (Kaskade + Disqualifikation)
- Andere Crons (Abrechnung/Termin) sind Fall-/Claim-scoped

**Konvention:** VPS-Crons, nicht `vercel.json` (Memory `feedback_vps_crons`).

### 3.8 Tests

- `src/lib/leads/__tests__/convert-lead-to-claim.test.ts`
- `src/lib/__tests__/lead-fall-mapping.test.ts`
- `src/lib/dispatch/karte/triage-leads.test.ts`
- `src/app/kfzgutachter-lp/__tests__/actions.test.ts`
- **Keine** dedizierte E2E-Suite für Lead-Flows; keine RLS-Tests für leads (P1-3)

---

## §4 · Cross-Check (Redundanz / Inkonsistenz / Dead-Code)

### 4.1 Redundanz
- **Lead-Writer:** zentralisiert seit AAR-110/leads-writer-konsistenz-audit (15.05.). Keine echten Code-Duplikate mehr — jeder Eintrittspunkt geht durch `createLead()`. **EINE Ausnahme:** RPC `convert_anfrage_zu_lead` (P0-1, bewusst SQL-only).
- **Email-Templates:** `LeadReminder1/2/3.tsx` sind separat (3 Delays). Akzeptabel.
- **Form-Validation:** jede LP validiert lokal; keine gemeinsame Basis (P1-5 / P2-5).

### 4.2 Inkonsistenz
- **Result-Pattern:** `createLead` → `{ok}`; `createManualLead` → `{success}` (P1-1)
- **Webhook-Return:** `aircall/inbound` returnt `NextResponse.json({ ok })` (HTTP-Response, ist OK für Webhooks — kein Caller im App-Pfad)
- **Komponenten-Layer:** `dispatch/leads/[id]/ExitSkript.tsx` nutzt handgerolltes `bg-red-50 border-red-200` statt `primitives.Card`/`shared.SectionCard` (P2-3)
- **Nested-FK-Normalisierung:** Pattern `Array.isArray(x) ? x[0] : x` korrekt, aber häufig wiederholt — nicht DRY (kein Bug, nur Hygiene)

### 4.3 Dead-Code (mit Vorsicht — Reader-Sweep nötig)
- **`leads.sa_signiert`** (AAR-578 gedropt) — keine JS-Reader gefunden ✓
- **`leads.vollmacht_signiert`** (AAR-579 gedropt) — keine JS-Reader gefunden ✓
- **Auskommentierte Channel-Side-Effects** in `convert_anfrage_zu_lead` (Zeile 58-89): Gutachter-Termin-Channel + Makler-Channel, dokumentiert mit Blockern (P2-1)

### 4.4 Missing Coverage
- **RLS-Test-Suite für leads:** keine gefunden (P1-3)
- **Twilio-Webhook-Sig-Verify:** keine Validierung (P0-2)
- **Audit-Log:** `lead_historie`-Tabelle existiert, kein Code schreibt rein (P0-3)
- **Auto-Disqualifikation-Notice:** `mark_expired_leads()` setzt `disqualifiziert=true` ohne Dispatcher-Notification (P2-2)

---

## §5 · Konsolidierte Befunde (priorisiert)

### P0 — Production-Risiko, sofort fixen

**P0-1 · RPC `convert_anfrage_zu_lead` schreibt `leads` ohne `source_channel`/`status`**
- Datei: `supabase/migrations/20260518193208_convert_anfrage_zu_lead.sql:48-56`
- Befund: `INSERT INTO leads (vorname, nachname, telefon, email, kunde_plz)` — 5 Spalten. `source_channel` + `status` fehlen.
- Impact: Bypass der `createLead()`-Compile-Time-Erzwingung. Wenn DB keine Defaults für diese Spalten hat → NULL → Dispatcher-Status-Filter (`status='neu'`) sieht den Lead nicht → Lead bleibt unsichtbar.
- Caveat: ich habe DB-Defaults nicht verifiziert (Migrations-Suche für `leads`-Schema-Definition timeoutete). Wenn `status` DEFAULT `'neu'` hat, ist es nur P1; wenn nicht, ist es P0.
- Fix: RPC-DDL ergänzen — `INSERT INTO leads (..., source_channel, status) VALUES (..., 'kfzgutachter-ads-lp', 'neu')`. 2 Zeilen.

**P0-2 · Twilio-Inbound-Webhook ohne `X-Twilio-Signature`-Verify**
- Datei: `src/app/api/webhooks/twilio/inbound/route.ts:75-85`
- Befund: `POST`-Handler ruft `parseTwilioBody(req)` und prüft nur `MessageSid` für Idempotenz. Keine `validateRequest()`/HMAC-Prüfung.
- Vergleichsbasis: `src/app/api/webhooks/aircall/inbound/route.ts:38-47` verifiziert HMAC ✓.
- Impact: Fremde können Fake-`POST /api/webhooks/twilio/inbound` mit gefälschten WA-Bodies + Media-URLs schicken → Auto-Insert in `whatsapp_inbound_messages`, Auto-OCR auf gefälschte Bilder, Auto-Update von `leads.zb1_*`/`leads.polizeibericht_*` mit kontrolliertem Inhalt, kontrollierte Notifications. Auch DoS-Vektor (Spam ohne Auth-Kost).
- Fix: `twilio.validateRequest(authToken, signature, url, params)` am Start des Handlers — siehe Twilio-Docs. ~45 min inkl. Test.

**P0-3 · `lead_historie` ist Audit-Trail-leer**
- Datei: `supabase/migrations/20260513151701_aar_lead_historie_lock.sql` (Tabelle + Policy `lead_historie_service_only`)
- Befund: Tabelle existiert seit 13.05., aber kein Code (Server-Action, Trigger, Cron) schreibt rein. Konversion `convertLeadToClaim` loggt keinen Audit-Eintrag.
- Impact: Bei Streit ("warum ist der Lead disqualifiziert?", "wer hat den Status geändert?") gibt es keine Spur. Compliance-Risiko.
- Fix: entweder
  - (a) AFTER-UPDATE-Trigger auf `leads` der Status-Changes in `lead_historie` schreibt (DDL via supabase-CLI, Regel 2), oder
  - (b) explizite Inserts an den 3 Stellen wo `status` mutiert wird (`convertLeadToClaim`, `mark_expired_leads`, `createManualLead`-Updates).
  - Trigger ist robuster (keine Drift-Gefahr bei neuer Action).

### P1 — Architektur / Konsistenz

**P1-1 · Result-Pattern-Drift (createManualLead)**
- `src/app/dispatch/leads/actions.ts:51` returnt `{ success, error?, leadId? }`
- `src/lib/leads/create-lead.ts:45-47` returnt diskriminierte Union `{ ok: true, leadId } | { ok: false, error }`
- AGENTS.md §Server-Actions sagt explizit: „Vermeide den Mix mit `success` (alte Files), neue Code-Pfade nutzen `ok`."
- Fix: `createManualLead`-Return auf `{ ok, error?, leadId? }` umstellen + Caller anpassen.

**P1-2 · Fehlende Server-side-Zod in 3 Quellen**
- `src/app/dispatch/leads/actions.ts` (`createManualLead`)
- `src/app/dispatch/kalender/_actions/spontan.ts` (`createSpontanTermin`)
- `src/app/api/webhooks/aircall/inbound/route.ts` (Webhook-Body)
- Impact: keine Typsicherheit am Eingang, keine konsistente Error-Message für UI.
- Fix: Zod-Schemas in `src/lib/schemas/lead-*` zentralisieren, in Actions `.safeParse()` aufrufen. ~2h.

**P1-3 · Keine RLS-Tests für `leads`-Policies**
- AAR-888 hat 9→6 Policies konsolidiert, aber keine Test-Suite hängt dran.
- Fix: Test in `src/lib/leads/__tests__/leads-rls.test.ts` mit Service-Role-Setup pro Rolle (admin, dispatch, kundenbetreuer, kanzlei, makler, sv, anon, authenticated-other) + Expected-Visibility-Matrix. ~2h.

**P1-4 · Mini-Wizard Geocoding-Failure ohne Compensation**
- `src/lib/actions/create-lead-from-mini-wizard.ts:108-127` — `void (async () => { mapbox... })()` fire-and-forget
- Bei Mapbox-API-Fehler bleibt `unfallort_lat/lng` NULL — Dispatcher sieht den Lead, aber Triage-Karte zeigt ihn nicht, ohne Hinweis was schiefging.
- Fix: bei Failure `try/catch` + `createNotification('dispatch', 'lead-geocoding-fail', ...)` mit Lead-Link. Oder Sentry-Tag setzen + UI-Indicator in Lead-Detail. ~1h.

**P1-5 · `source_channel: string` statt Union-Type**
- `src/lib/leads/create-lead.ts:34` — `source_channel: string`
- Praktisch werden nur 6 Werte genutzt: `'mini_wizard' | 'rueckruf' | 'aircall-inbound' | 'dispatch_spontan' | 'admin-direkt' | 'kfzgutachter-ads-lp'` (+ Webhook-Quellen)
- Fix: Union-Type definieren, `LeadBase['source_channel']` enger — fängt Typos beim nächsten Contributor. ~30 min.

### P2 — Hygiene / Cleanup

**P2-1 · Auskommentierte Channel-Side-Effects in `convert_anfrage_zu_lead`**
- Migration:58-89 — Gutachter-Termin-Channel + Makler-Channel, mit dokumentierten Blockern (`admin_termine.erstellt_von` NOT NULL, `leads.vermittelnder_makler_id` existiert nicht)
- Entscheidung treffen: aktivieren (Migration für nullable + Spalte anlegen) oder Code löschen.

**P2-2 · Auto-Disqualifikation ohne Dispatcher-Notice**
- RPC `mark_expired_leads()` setzt `disqualifiziert=true` nach 7 Tagen blind
- Cron `send-lead-reminders` ruft RPC auf
- Fix: nach RPC `SELECT id, vorname, nachname FROM leads WHERE just_disqualified` → Bulk-Notification an dispatch-Rolle mit Liste. Oder direkt im RPC `NOTIFY pgcron` raus + Cron pickt es auf.

**P2-3 · Komponenten-Layer-Drift in Phase-Files**
- `src/app/dispatch/leads/[id]/ExitSkript.tsx` — handgerolltes Tailwind statt `primitives.Card` / `shared.SectionCard`
- 2-3 weitere Phase-Components mit `bg-red-50 border-red-200` (Tailwind-Defaults statt Claimondo-Tokens)
- AGENTS.md §claimondo-component-set definiert: Atom-Layer = `primitives/*` Pflicht. Hier nicht eingehalten.
- Fix: refactor zu `primitives.Card` + `primitives.Alert` (oder `shared.SectionCard`). ~1.5h.

**P2-4 · Tote Spalten — Reader-Sweep & ggf. Drop**
- `leads.sa_signiert` (AAR-578 gedropt) — ✓ kein Reader
- `leads.vollmacht_signiert` (AAR-579 gedropt) — ✓ kein Reader
- Bestätigt; keine Aktion nötig, aber Memory aktualisieren.

**P2-5 · `source_channel`-Werte zentral dokumentieren**
- Beim Lesen von Code muss man die 6 möglichen Werte aus den 7 Aufrufstellen zusammensuchen
- Fix: `src/lib/leads/source-channels.ts` mit Union-Type + Kommentar pro Wert (woher kommt der Lead, wer setzt ihn). Dann `source_channel: SourceChannel` (kombiniert mit P1-5). ~30 min.

---

## §6 · Korrigierte Agent-Befunde (Falsch-Positive — raus aus dem Backlog)

### Falsch: „`quali-offen` nicht im Enum"
- **Agent-Befund:** Vertikal-Agent Phase 3 P0 #2 — Status `quali-offen` (in `createSpontanTermin`) sei möglicherweise nicht im Enum.
- **Korrektur:** `quali-offen` IST im Enum. Der Kommentar in `src/lib/leads/create-lead.ts:7-9` dokumentiert ausdrücklich: „`dispatch_spontan` schrieb sogar einen ungültigen lead_status-Enum-Wert" — das war HISTORISCH und wurde mit Einführung von `createLead()` gefixt (`type LeadStatus = Database['public']['Enums']['lead_status']` in Zeile 24 — TypeScript würde sonst nicht kompilieren).

### Falsch: „`bg-[#25D366]` Token-Audit-Verstoß"
- **Agent-Befund:** Horizontal-Agent Phase 3 — 5 Stellen mit `bg-[#25D366]` (WhatsApp-Grün) ohne Token, „Token-Audit-CI bricht beim nächsten Run".
- **Korrektur:** WhatsApp-Grün ist explizit whitelisted in `src/lib/external-brand-colors.ts:16` (`WHATSAPP_GREEN = '#25D366'`) und in `AGENTS.md §branding-rules` als Whitelist-Exception gelistet. `npm run check:token-audit` kennt die Whitelist und bricht NICHT.

---

## §7 · Vorgeschlagene Linear-Tickets

| ID-Vorschlag | Titel | Prio | Aufwand |
|--------------|-------|------|---------|
| AAR-LEAD-1 | RPC `convert_anfrage_zu_lead` ergänzt `source_channel` + `status` | P0 | 0.5h (inkl. Smoke) |
| AAR-LEAD-2 | Twilio-Inbound-Webhook: `X-Twilio-Signature`-Verify | P0 | 1h |
| AAR-LEAD-3 | `lead_historie`-Trigger (Status-Mutations) | P0 | 2h (inkl. Migration + Smoke) |
| AAR-LEAD-4 | `createManualLead` Return auf `{ok}` normalisieren | P1 | 0.5h |
| AAR-LEAD-5 | Server-side-Zod in 3 Quellen + zentrales Schema-Modul | P1 | 2h |
| AAR-LEAD-6 | RLS-Test-Suite für `leads`-Policies (6 Policies × 8 Rollen) | P1 | 2-3h |
| AAR-LEAD-7 | Mini-Wizard Geocoding-Failure → Dispatcher-Notice | P1 | 1h |
| AAR-LEAD-8 | `SourceChannel`-Union + zentrales Doku-Modul | P1+P2 | 1h |
| AAR-LEAD-9 | `convert_anfrage_zu_lead` Channel-Side-Effects: Decision (aktivieren oder löschen) | P2 | 0.25h Decision + 0.5-2h Implementation |
| AAR-LEAD-10 | Auto-Disqualifikation Dispatcher-Notice | P2 | 1h |
| AAR-LEAD-11 | Phase-Components → `primitives.Card`/`shared.SectionCard` | P2 | 1.5h |

**Bündelungs-Vorschlag:** P0-1+P0-3 + P1-1+P1-5+P2-5 in einem Lead-Hygiene-PR; P0-2 als eigenständiger Security-PR; Rest einzeln.

---

## §8 · Out-of-Scope-Beobachtungen

Während der Recherche aufgefallen, aber nicht Lead-Audit-Scope:

- **CMM-44 SP-A-Pattern** ist in vielen Lead-betreffenden Stellen zu sehen (`claims:claim_id(kundenbetreuer_id, claim_nummer)` + `Array.isArray(...)` Normalisierung). Konsistent durchgezogen — kein Befund, aber Pattern könnte in einen Helper `getFallClaim(supabase, fallId)` extrahiert werden.
- **WhatsApp-Migration zu Baileys** (Memory `project_baileys_whatsapp`) ist noch nicht im Code sichtbar; alle Lead-WA-Sends gehen über Twilio. Wenn Baileys-Worker live geht, betrifft das Mini-Wizard + Dispatch-Spontan + Twilio-Webhooks.
- **Aircall-Webhook erzeugt Lead-Stub mit `vorname: 'Unbekannt'`** — bei späterer Anreicherung sollte das überschrieben werden. Memory hat keinen Hinweis dass das aktuell passiert; potenzielles Backlog.

---

## §9 · Verifikations-Log (was am Code geprüft wurde)

| Verifikation | Quelle | Ergebnis |
|--------------|--------|----------|
| RPC `convert_anfrage_zu_lead` INSERT-Spalten | Migration:48-56 gelesen | bestätigt — 5 Spalten, source_channel/status fehlen |
| Twilio-Inbound-Webhook Sig-Verify | gesamte Route gelesen (610 Zeilen) | bestätigt — keine X-Twilio-Signature-Verarbeitung |
| `quali-offen` im Enum | create-lead.ts:7-9 Kommentar + Zeile 24 Type-Resolution | widerlegt Agent-Befund |
| `#25D366` Token-Audit-Whitelist | external-brand-colors.ts:16 gelesen | widerlegt Agent-Befund |
| `createLead`-Result-Type | create-lead.ts:45-47 gelesen | bestätigt `{ok}`-Pattern; createManualLead driftet (`{success}`) |
| `lead_status`-Enum-Definition | Grep timeoutet | indirekt verifiziert via Horizontal-Agent-Inventory + create-lead.ts:24 |
| DB-Defaults für leads.status/source_channel | nicht verifiziert | offen — beeinflusst Schwere von P0-1 |

---

---

## §10 · Re-Check 20.05.2026 (nach „check nochmal")

Zweite Verifikations-Runde am Code. Drei Korrekturen + ein neuer Lead-relevanter Sub-Befund. Die ursprünglichen Befunde bleiben strukturell stehen, aber zwei Schweregrade ändern sich.

### 10.1 · Korrektur: P0-3 → P1-6 (degradiert)
**Ursprünglich:** „`lead_historie` wird von keinem Code beschrieben."

**Verifikation:** Grep auf `lead_historie` in `src/` liefert:
- `src/app/api/admin/create-test-fall/route.ts:261` — `admin.from('lead_historie').insert([...])` mit 3 Beispiel-Einträgen (Test-Seed)
- `src/app/faelle/[id]/_actions/core.ts:37` — Tabellen-Liste für Cleanup/Truncate

Migration `20260513151701_aar_lead_historie_lock.sql:11-16` dokumentiert die Architektur ausdrücklich:
> „Caller-Befund (Sweep 13.05.2026): Keine cookie-authenticated Reads in src/. Inserts in api/admin/create-test-fall (Seed) und Cleanup in _actions/core.ts laufen beide über createAdminClient → service_role-bypass."

Die Tabelle ist also **nicht „leer durch Bug", sondern „service-role-only by design"** (RLS-an + 0 Policies). Lücke: kein Trigger schreibt Status-Mutations rein, keine Production-Action (`convertLeadToClaim`, `mark_expired_leads`, `updateLeadStatus`) loggt.

**Schweregrad:** P1 (Compliance-Lücke) statt P0 (Production-Risiko).

**Trigger-Sweep:** `CREATE TRIGGER` auf `leads` liefert nur `trg_leads_lead_nummer` (Migration `20260426090000`). Kein Audit-/Status-Mutation-Trigger.

### 10.2 · Erweiterung P0-2 (Twilio-Webhook ohne Sig-Verify)

**Neuer Fund:** Sig-Verify-Pattern existiert bereits in `src/app/api/twilio/inbound-kb-whatsapp/route.ts:10-24` — `validateTwilioSignature` mit HMAC-SHA1 (Standard-Twilio-Schema). Gute Vorlage für die fehlende Stelle.

**Aber:** die Vorlage hat zwei eigene Schwächen:
- **Zeile 32:** `if (process.env.NODE_ENV === 'production')` — Sig-Verify wird in `staging` + `dev` **komplett übersprungen**. Heißt: Staging-Smoke fängt Sig-Verify-Bugs nicht; bei einem Deploy-Fehler (z.B. fehlendes `TWILIO_AUTH_TOKEN` in `/etc/claimondo/.env.local`) merkt es niemand bis Prod
- **Zeile 16:** URL hardcoded `'https://cmndo.vercel.app/api/twilio/inbound-kb-whatsapp'` — Memory `project_vps_infrastructure` sagt Prod läuft auf `app.claimondo.de` (VPS, nicht mehr Vercel). Wenn Twilio den Webhook über die VPS-Domain aufruft, baut der Code seine HMAC mit der falschen URL → Sig-Match schlägt immer fehl → 403 für jeden Inbound

**Fix-Empfehlung beim Portieren auf `/api/webhooks/twilio/inbound`:**
1. Sig-Verify in allen Envs aktiv (nicht production-only) — Staging muss Bugs sehen können
2. URL aus `NEXT_PUBLIC_APP_URL` ableiten statt hardcoden
3. Bei `inbound-kb-whatsapp` gleich mitfixen (gleicher Author, gleiches Pattern)

### 10.3 · NEU P2-6 · 22+ hardcoded `cmndo.vercel.app` Fallback-URLs

Beim Sig-Verify-Reader-Sweep gestolpert. Memory sagt prod = `app.claimondo.de` (VPS), aber Code hat 22+ Stellen mit `process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'`. Lead-direkt-relevant:

- `src/lib/whatsapp.ts:325` — Magic-Link-URL für WA-Sends an Leads
- `src/app/flow/[token]/actions.ts:1073` — Flow-Wizard (Lead-Erfassung)
- `src/lib/termine/trigger-losgefahren.ts:83` — Termin-Tracking-Links (Lead→Fall)

Wenn `NEXT_PUBLIC_APP_URL` in der VPS-ENV korrekt gesetzt ist, greift der Fallback nie und alles funktioniert. Risiko: ein ENV-Reset (`.env.local`-Rotation, neues Deploy ohne ENV-Sync) lässt User auf eine potenziell tote Vercel-URL klicken.

**Empfehlung:**
1. ENV-Audit: `NEXT_PUBLIC_APP_URL=https://app.claimondo.de` in `/etc/claimondo/.env.local` (Prod) + `app.staging.claimondo.de` (Staging) verifizieren
2. Code-Fallback entweder auf aktuelle Domain umstellen oder werfen (`throw new Error('NEXT_PUBLIC_APP_URL missing')`)

Out-of-scope für reines Lead-Audit, aber durch Lead-Magic-Link-Lookup gestoßen — gehört in den Top-Punkten.

### 10.4 · P0-1 (RPC-Bypass) — bestätigt, weiter offen

`src/app/kfzgutachter-lp/actions.ts` vollständig gelesen: `submitKfzgutachterLead` ruft RPC an Zeile 112-115, macht **kein** Post-RPC-`UPDATE leads SET status = 'neu'`. Caller-Pfad bestätigt den RPC-Bypass.

DB-Default für `leads.status` konnte ich nicht abschließend verifizieren — `CREATE TABLE leads` ist in `supabase/_archive/migrations-pre-tracking/` und der Glob darauf timeoutete. Auch ohne diese Verifikation:

- Selbst wenn DB-Default `'neu'` existiert, ist der Bypass der Compile-Time-Erzwingung in `createLead()` eine Inkonsistenz
- `source_channel` hat sicher keinen sinnvollen Default — kfzgutachter-LP-Leads tragen ihn nicht und sind damit nicht von anderen unterscheidbar (Reporting/Analytics-Lücke)

Befund bleibt P0 für `source_channel` und P0-oder-P1 für `status` (offene Verifikation).

### 10.5 · DB-Sicht ergänzt: Functions + Indizes

Nach Aaron-Frage „leads in der db komplett abgedeckt?" — Function- und Index-Sweep nachgezogen.

**Lead-bezogene DB-Functions (5+ gefunden, vorher nur `mark_expired_leads` + `set_lead_nummer` erwähnt):**
- `mark_expired_leads()` — Migration `_archive/.../20260418050917_aar477_c11_lead_reminders.sql:15` + Fix `20260510211156_aar477_fix_mark_expired_leads_column.sql:5` (7-Tage-Auto-Disqualifikation)
- `set_lead_nummer()` — Migration `20260426090000_aar829_extend_leads_for_claim_konversion.sql:12` (Trigger-Function)
- `convert_anfrage_zu_lead(uuid)` — Migration `20260518193208` (P0-1)
- `set_claim_nummer()` — Migration `20260426090100_aar829_extend_claims_for_lead.sql:12` (Lead→Claim-Konversion)
- `is_staff()` + `is_admin()` — Migration `20260427201146_cmm23_fix_is_staff_leadbearbeiter.sql:10,25` (RLS-Helper)
- Plus per Memory `feedback_rls_function_grants`: `dispatcher_owns_lead`, `is_claim_user_party`, `is_sv_for_claim` — SECURITY-DEFINER-Functions die GRANT EXECUTE TO authenticated explizit brauchen (sind bei CREATE OR REPLACE schon 1× verloren gegangen → AAR-894)

**Indizes auf `leads` (6 gefunden):**
- `idx_leads_zb1_token` — Partial (WHERE zb1_token IS NOT NULL)
- `idx_leads_gegner_versicherung_id` — Partial
- `leads_polizeibericht_token_idx`
- `idx_leads_vehicle` (Migration `20260425120200_aar773`)
- `idx_leads_konvertiert_durch_user_id` (Migration `20260513163628_aar_perf_fk_indexes:85`)
- `idx_leads_konvertiert_zu_fall_id` (Migration `20260513163628_aar_perf_fk_indexes:86`)

**Index-Lücke (NEU P2-7):** **kein Index auf `leads.status`**. Dispatch-Lead-Liste filtert nach `status` (`/dispatch/leads` Default-View) + Cron `dispatch-lead-alert` scannt `qualifizierungs_phase='neu' > 5min` — bei wachsender `leads`-Tabelle (Memory CMM-44: 506 Reads insgesamt offen) wird das Seq-Scan. Empfehlung: `CREATE INDEX idx_leads_status ON leads(status)` + ggf. composite `(status, created_at DESC)` für Dispatch-Sort.

**Was DB-seitig NICHT verifizierbar war:**
- `CREATE TABLE leads` Initial-Statement: weder in `supabase/migrations/` noch in `_archive/migrations-pre-tracking/` per Grep findbar. Vermutlich via Supabase-Studio initial angelegt (vor jeglicher Migration-Tracking). Konsequenz: `leads.status`- und `leads.source_channel`-DB-Defaults sind nur via Live-Query (`information_schema.columns`) bestimmbar. Memory `feedback_information_schema_check` sagt: vor Cluster-Refactor live abfragen. Empfehlung: einmal `npx supabase db query --linked` mit `SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name='leads' AND column_name IN ('status', 'source_channel')` — danach ist P0-1 final eingestuft.
- Live-RLS-Verhalten: 6 Policies sind im Code dokumentiert (siehe §3.1), aber kein Test prüft das tatsächliche Visibility-Verhalten pro Rolle. P1-3 bleibt.

### 10.6 · Aktualisiertes Verifikations-Log (Ergänzung zu §9)

| Verifikation | Quelle | Ergebnis |
|--------------|--------|----------|
| `lead_historie` Writer-Sweep in src/ | Grep `lead_historie` in `src/` | 2 Treffer: Test-Seed + Truncate-Liste — Production-Flow loggt nicht |
| `lead_historie` Architektur-Intent | Migration:11-16 gelesen | service-role-only by design (kein „Bug", aber Trigger fehlt) |
| Twilio-Sig-Verify-Pattern existiert | `/api/twilio/inbound-kb-whatsapp/route.ts` (60 Zeilen) gelesen | ja — HMAC-SHA1, aber prod-only + hardcoded URL |
| `CREATE TRIGGER.*leads` | Grep in `supabase/` | nur `trg_leads_lead_nummer` (kein Audit-Trigger) |
| `cmndo.vercel.app` Hardcoded-Sweep | Grep in `src/` | 22+ Stellen mit Fallback |
| `kfzgutachter-lp/actions.ts` Post-RPC-Update? | Datei vollständig gelesen | kein UPDATE — RPC-Bypass bestätigt |
| `leads.status` DB-Default | Grep timeoutete auf `_archive/migrations-pre-tracking/` | unverifiziert — P0-1 Schweregrad-Frage bleibt offen |

---

---

## §11 · Live-DB-Verifikation 20.05.2026

Nach Aaron-Frage „leads in der db komplett abgedeckt?" — die zwei offenen DB-Punkte (Defaults + RLS-Live) im neuen Worktree `kitta/aar-lead-audit-followups` (von `staging`) per `supabase db query --linked` geprüft.

### 11.1 · `leads.status` + `leads.source_channel` Defaults

| Spalte | `column_default` | `is_nullable` | Konsequenz |
|---|---|---|---|
| `leads.status` | `'neu'::lead_status` | NO | DEFAULT greift bei RPC-Insert ohne expliziten Wert → kein Production-Crash. **P0-1 für `status` ist entschärft.** |
| `leads.source_channel` | (NULL) | YES | Kein Default → RPC-Leads schreiben `NULL`. **Konsistenz-/Reporting-Drift bleibt — P1.** |

**`lead_status`-Enum hat 8 Werte:** `disqualifiziert`, `flow-gesendet`, `kalt`, `neu`, `quali-offen`, `rueckruf`, `umgewandelt`, `umgewandelt-sv`. `quali-offen` ist final bestätigt drin.

### 11.2 · `source_channel`-Drift empirisch (service_role Baseline)

```sql
SELECT source_channel, count(*) FROM leads GROUP BY source_channel;
```

| source_channel | leads | status_neu | konvertiert | disqualifiziert |
|---|---:|---:|---:|---:|
| `mini_wizard` | 205 | 1 | 5 | 69 |
| `gutachter_finder_self_dispatch` | 63 | 0 | 34 | 0 |
| **`NULL` (RPC-Drift)** | **10** | **6** | **3** | **1** |
| `self_service` | 7 | 7 | 0 | 0 |
| `elementor` | 1 | 1 | 0 | 0 |
| `manuell` | 1 | 1 | 0 | 0 |

**Empirische Erkenntnisse:**

1. **10 Production-Leads haben `source_channel = NULL`** — alle aus dem RPC-Bypass von kfzgutachter-LP. 6 davon aktiv (`status='neu'`), 3 zu Fall konvertiert (permanent ohne Source-Tag), 1 disqualifiziert.
2. **Drei Lead-Quellen wurden im Vertikal-Audit nicht erfasst:**
   - `gutachter_finder_self_dispatch` — **63 Leads, 34 konvertiert (höchste Konversionsrate!)** — fehlte im 7-Quellen-Trace
   - `self_service` — 7 Leads (vermutlich Self-Service-Flow eines Kunden)
   - `elementor` — 1 Lead (alter WordPress-Funnel?)
3. **Naming-Drift bestätigt:** Mischung underscore/Bindestrich/nix (`mini_wizard`, `self_service`, `gutachter_finder_self_dispatch` vs `dispatch_spontan` aus Code vs `admin-direkt`/`aircall-inbound` mit Bindestrich vs `manuell`/`elementor`/`rueckruf` ohne Trennzeichen). → **NEU P2-8**.

### 11.3 · RLS-Smoke partial — `claims`-Grant blockiert anon

`SET LOCAL ROLE anon; SELECT count(*) FROM public.leads` crasht mit:
> `42501: permission denied for table claims — HINT: Grant the required privileges to the current role with: GRANT SELECT ON public.claims TO anon;`

Heißt: die RLS-Policy auf `leads` referenziert `claims` (vermutlich via SECURITY-INVOKER-Pfad oder Join), und der Grant ist nicht durchgängig. Passt zum bekannten **AAR-894-Pattern** (Memory `feedback_rls_function_grants`: SECURITY-DEFINER-Functions in RLS-Policies verlieren `GRANT EXECUTE TO authenticated` bei `CREATE OR REPLACE`/Policy-Refactor).

**NEU P1-8** (RLS-Function-Grant-Sweep nach AAR-894-Pattern). Vollständiger RLS-Test pro Rolle bleibt P1-3.

### 11.4 · Final-Schweregrad-Tabelle (konsolidiert nach §10 + §11)

| Original | Final | Bemerkung |
|---|---|---|
| P0-1 (RPC-Bypass `status`) | **n/a** | DB-Default `'neu'` greift |
| P0-1 (RPC-Bypass `source_channel`) | **P1** | 10 Leads NULL — Reporting-Drift, kein Crash |
| P0-2 (Twilio-Sig-Verify) | **P0** unverändert | Spoofing-Risiko bleibt |
| P0-3 (lead_historie) | **P1** | Service-only by design, Trigger fehlt |
| P1-1..5 | P1 unverändert | — |
| **NEU P1-7** | **P1** | 3 fehlende Lead-Quellen im Audit-Inventar (gutachter_finder_self_dispatch, self_service, elementor) |
| **NEU P1-8** | **P1** | RLS-Function-Grant-Sweep |
| P2-1..7 + cmndo | P2 unverändert | — |
| **NEU P2-8** | **P2** | source_channel-Naming-Drift |

→ Echte verbleibende P0-Befunde: **1** (Twilio-Webhook-Sig-Verify).

---

**Ende des Audits.**
