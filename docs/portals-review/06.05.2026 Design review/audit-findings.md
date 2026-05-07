# Audit-Findings — SV / Dispatch / Kunde + Communication-Layer

Stand: 2026-05-06. Konsolidierung aus vier parallelen Sub-Audits (Communication-Layer, RLS+Auth, Server/Client-Boundaries+Error-Handling, Performance+Schema-Drift). Gruppiert nach Priorität, nicht nach Bereich — damit Fixer und Design-Reviewer den Schmerz an einer Stelle sehen.

## 🔴 Kritisch (vor Production-Smoke fixen)

| # | Bereich | Datei:Zeile | Problem |
|---|---|---|---|
| 1 | Auth | `src/app/mitarbeiter/layout.tsx:28` | `dispatch` darf ins KB-Portal — sollte nur `kundenbetreuer` + `admin` |
| 2 | Auth | `src/app/kunde/layout.tsx:99-141` | `createAdminClient()` für KB/SV/Admin-Card-Daten bypassed RLS — Cross-User-Leak möglich |
| 3 | Auth | `src/app/flow/[token]/page.tsx:76-77` | Token-Reuse nach `status='abgeschlossen'` möglich — Token wird nicht invalidiert |
| 4 | Auth | mehrere `cron/*/route.ts` | Min. 6 Cron-Routes ohne `CRON_SECRET`-Auth (`no-show-timeout`, `abrechnung-erstellen`, weitere) |
| 5 | RLS | `mitteilungen` + `gutachter_mitteilungen` | Keine `CREATE POLICY` in Migrations — wenn RLS aktiviert ist, ggf. zu permissiv. Falls nicht aktiviert: jeder authentifizierte User sieht alle Mitteilungen |
| 6 | Auth | `src/app/admin/tasks/actions.ts:8-36` | `requireRole` importiert aber nicht aufgerufen — Admin-Action ist offen |
| 7 | Chat | `src/app/kunde/_components/KundeKbChat.tsx:115-124` | Optimistic-Match per `sender_id+nachricht`-Heuristik — bei zwei schnellen Sends mit gleichem Text → Duplikat |
| 8 | Error | `src/app/admin/team/actions.ts:56` | `sendCommunication` ohne try/catch — Mitarbeiter angelegt aber bekommt keine Einladung wenn Twilio fällt aus |
| 9 | Bundle | `src/app/flow/[token]/actions.ts:173` | `CreateKundeAccountResult` Type aus `'use server'`-File exportiert — wenn Client importiert: `undefined` zur Laufzeit (AAR-664-Pattern) |
| 10 | Type | `src/lib/mitteilungen/types.ts:9-18` | `EmpfaengerRolle`-Union enthält `'dispatch'` zweimal (C+P-Fehler) |

## 🟡 Polish (wichtig, nicht blocker)

### Code-Qualität

- **Result-Shape-Chaos**: 572× `{ success: ... }` vs. 163× `{ ok: ... }` in Server-Actions. AGENTS.md sagt `ok` ist Standard. Großer Refactor.
- **`MultiChannelChat` Realtime ohne Kanal-Filter** (`src/components/chat/MultiChannelChat.tsx:128-145`): subscribed auf alle nachrichten, filtert Client-seitig. Kanal-Filter würde Realtime-Traffic reduzieren.
- **`useMitteilungen` Realtime ohne empfaenger-Filter** (`src/components/mitteilungszentrale/useMitteilungen.ts:56-62`): jeder Client sieht alle mitteilungen-Events. Sollte `filter: empfaenger_id=eq.${userId}`.
- **`MitteilungTyp` ohne Exhaustiveness-Check** (`src/lib/mitteilungen.ts:5-23`): 22+ Varianten, neue Typen können `buildMessage()` verfehlen ohne Compile-Error.
- **`markMessagesRead` schluckt Errors** mehrfach: `.catch(() => {})` ohne Logging.
- **`generateSAPdf` ohne `revalidatePath`** (`src/app/flow/[token]/actions.ts:120`): SA-PDF-URL wird gesetzt, Caches nicht invalidiert.
- **Duplicate-Implementation**: `markKundeChatMessagesRead` (`src/app/kunde/_components/kb-chat-actions.ts:62`) markiert ALLE empfaenger-eigene Messages, während `MultiChannelChat.markMessagesRead` (`src/components/chat/MultiChannelChat.tsx`) nur fremde markiert. Inkonsistent — kann Counter-Drift erzeugen.

### Performance

- **`cron/gutachter-erinnerungen/route.ts:35-93`**: N+1-Loop über Termine, pro Termin SV+Profile+Lead einzeln. Bei 50+ Terminen → 250+ Queries. Batch via `.in()` parallel.
- **`/admin/nachrichten/page.tsx:39-59`**: 3 sequenzielle Queries (nachrichten → faelle → leads). Können auf 2 Promise.all reduziert werden.
- **`getUnreadCountsBatch`** (`src/lib/faelle/unread-counts.ts:62-79`): RPC-Loop pro Fall sequenziell statt batched.
- **SV-Layout** (`src/app/gutachter/layout.tsx:17-44`): `profiles`-Query mehrfach pro Page-Load. Bei 1000 SVs spürbar.
- **76% der Components haben `'use client'`**: viele könnten Server-Components sein (z.B. `FaqBotAnalyseCard`, `AnforderungenListe`, `FallCardBadges`, `ClaimondoKundenHeader`, `AuftragDokumenteBanner`).

### Schema-Drift (`claims` ↔ `faelle`)

- **`faelle.no_show_count + no_show_gemeldet_am` Direkt-Write** (`src/lib/actions/storno-actions.ts:75-78`): direkter Update auf `faelle` statt über State-Machine. Falls in Sync-Trigger covered, müsste auf `claims` schreiben.
- **`gutachter_termine.status` vs. `faelle.status` Koordination**: AAR-864-State-Machine separat von `transitionFallStatus`. Race-Risk wenn Webhook + DB gleichzeitig schreiben.
- **`losfahren_erinnerung_gesendet`**: in `cron/gutachter-erinnerungen/route.ts:93` direkt auf `faelle` geschrieben — falls Migration Phase 4 die Spalte droppt, bricht Cron stillschweigend (kein Status-200-OK-Check).

### Token-Pages

- **`enrichFlowLeadByFin`** (`src/app/flow/[token]/actions.ts:16-32`): kein Rate-Limiting. FIN-Brute-Force gegen Flow-Link möglich.
- **`/upload/dokumente/[token]/actions.ts:99-275`**: kein Size-Check vor Base64-Decode → 10MB-Spam-Uploads möglich.
- **`/upload/dokumente/[token]/actions.ts:460-464`**: OCR-Halter-Daten werden an Token-Bearer zurückgegeben — falls Anfrage-Email falsch → Sensitive-Leak.

### Auth-Patterns

- **`requireRole` nicht überall**: viele Admin-Actions haben nur User-Auth-Check, kein Rollen-Check (Layout-Guard schützt aber Action selbst ist offen).
- **`throw new Error()` für Business-Logic** (`src/app/admin/sachverstaendige/[id]/actions.ts:76, 93`): sollte Result-Pattern sein, nicht throw.

## 🟢 Nice-to-have (nach Smoke / Polish-Sprint)

- Hardcodierte Kanal-String-Listen statt zentraler Konstante (z.B. `src/app/admin/nachrichten/page.tsx:9`).
- `gutachter_mitteilungen` Link-Generation hard-codiert statt zentraler Helper.
- `markFallAsRead`-ähnliche ohne Error-Handler.
- `count_unread_updates` RPC-Definition nicht im Source-Code-Tree dokumentiert.
- `useId()`-Comments fehlen in einigen Realtime-Hooks (was Reviewer verwirren kann).

## Top-3 Drift-Risiken (Aaron's Aufmerksamkeit)

### 🔴 Risiko A — `gutachter_termine.status` vs. `faelle.status`
Wenn Webhook (z.B. Termin bestätigt) auf `gutachter_termine.status` schreibt und gleichzeitig irgendwo `faelle.status` per `transitionFallStatus` läuft, kann State inkonsistent werden. Symptom: Fälle bleiben in `sv-zugewiesen` obwohl Termin `bestaetigt`.
Fix: DB-Trigger der bei `gutachter_termine.status='bestaetigt'` automatisch `faelle.status='sv-termin'` setzt (oder via `transitionFallStatus` cascaded).

### 🔴 Risiko B — `faelle.no_show_count` Direkt-Write ohne State-Machine
`storno-actions.ts:75-78` schreibt direkt. Bei `count >= 2` soll Storno greifen. Wenn Update OK aber Transition fehl → Inkonsistenz: `count=2` aber `status='sv-termin'`.
Fix: Update + Transition atomar in der State-Machine, oder TX-Wrap.

### 🔴 Risiko C — `cron/gutachter-erinnerungen` schreibt auf potenziell deprecated Spalten
Schreibt auf `faelle.losfahren_erinnerung_gesendet` ohne Validation ob die Spalte noch existiert. Phase 4 (DROP der 41 Duplikate) würde Cron stillschweigend brechen.
Fix: Vor Phase 4 Cron-Spalten-Audit, plus Cron-Update-Result auf modified-rows checken (statt blind 200-OK).

## Was schon gefixt ist (Stand 2026-05-06)

- ✅ #513 — RLS-Bug `kunde_nachrichten_read` mit Legacy-Kanal-Namen (PR #513)
- ✅ #515 — Unread-Badge auf Kunde-Cards (PR #515)
- ✅ #517 — Google-Bewertung in Kunde-GutachterCard (PR #517)
- ✅ #519 — CSS-Workaround Tailwind-4-Bug mit leerem CSS-var-Aufruf (PR #519)
- ✅ #520 — Kennzeichen-Hydration-Stabilität (Star-Polygon-Precision)
- ✅ #521 — SV-Mobile-Sidebar (`relative`-Class-Konflikt mit `fixed`)
- ✅ #522 — Cookie-Banner versteckt in Portalen
- ✅ #523 — AuftragCard Logo kompakter
