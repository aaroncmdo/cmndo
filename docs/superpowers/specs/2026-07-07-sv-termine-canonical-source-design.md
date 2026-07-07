# Design: Kanonische DB-getriebene Termine-Quelle (`gutachter_termine`)

**Datum:** 2026-07-07
**Branch:** `kitta/sv-termine-canonical-source` (off `staging`)
**Session:** 6c630247 (Termin-Lifecycle)

## Problem

Der SV-Kalender (`/gutachter/kalender`) ist leer, Termine lassen sich nicht in die Tagesroute (`/gutachter/heute`) aufnehmen, und **~27 Consumer** über alle Rollen lesen **stale Termin-Spalten** (`sv_termin`, `aktueller_termin_*`, `gutachter_termin_*`) aus `v_faelle_mit_aktuellem_termin` (die aus `v_claim_base` selektiert).

## Root Cause (MCP-verifiziert)

Termine leben in der Tabelle **`gutachter_termine`**, gekeyt über **`assignee_id`/`assignee_typ`** (CMM-49) + bezug/lead/fall. Die Anbindung an einen Claim (`claim_id`) ist meist NULL:
- **47 von 58** `gutachter_termine` haben `claim_id` NULL.
- **25 von 34** SV-Termine (`assignee_typ='sachverstaendiger'`) haben `claim_id` NULL.

`v_claim_base` projiziert den „aktuellen Termin" nur via `get_aktueller_gt_termin_id(claim_id)` (Lookup per `claim_id`) → es kann die Mehrheit der Termine **strukturell nicht** sehen. Zusätzlich ist `v_claim_base` DEFINER + row-gated (0 Zeilen ausserhalb User-Kontext) = eine **Claim**-Surface, keine **Termine**-Surface.

➡ **Kein View-Rewrite behebt das.** Die einzige korrekte, vollständig DB-getriebene Quelle für Termine ist **`gutachter_termine` direkt**. Das entspricht Aarons Ansage „fälle mit aktuellem termin nutzen wir nicht mehr für Termine".

## Kanonische Lese-Muster (SSoT = `gutachter_termine`)

- **SV-scoped** („die Termine dieses SV"): `WHERE assignee_id = svId AND assignee_typ = 'sachverstaendiger'` (+ Status + Zeitfenster). Genutzt von Kalender, Tagesroute, SV-iterierenden Crons.
- **Fall-scoped** („der aktuelle Termin dieses Falls/Leads"): Dual-Lookup `fall_id` ODER `bezug_typ='lead'/bezug_id` ODER `lead_id` (bestehendes Muster in `lib/termine/loader.ts` + `finde-termin-fuer-lead.ts`). Genutzt von Fall-Detail-Surfaces.

**Nicht angefasst:** `v_claim_base`/`v_faelle_mit_aktuellem_termin` (contested — payment-ledger #3795 prod-live-unmerged; strukturell claim-scoped). Die ~300 Nicht-Termin-Spalten (inkl. Ledger-Geld) bleiben dort korrekt.

## Kanonische Helper (`lib/termine/`)

1. **`svTermine(db, svId, opts)`** — neu, `lib/termine/sv-termine.ts`
   - `opts = { statuses: string[]; from?: string; to?: string }`
   - Query: `gutachter_termine` `.eq('assignee_id', svId).eq('assignee_typ','sachverstaendiger').in('status', opts.statuses)` [+ `.gte/.lt('start_zeit', …)`] `.order('start_zeit')`
   - Select: `id, fall_id, lead_id, claim_id, bezug_typ, bezug_id, start_zeit, end_zeit, status, final_verbindlich_ab, gesehen_am, besichtigungsort_*`
   - Reine, testbare Query-Bau-Logik (Status/Fenster/assignee). Rückgabe = rohe Termin-Zeilen.
2. **`aktuellerTerminFuerFall(db, { fallId?, leadId? })`** — neu (oder Reuse von `loader.ts`/`findeTerminFuerLead`), Dual-Lookup, liefert den aktuellen (status-priorisierten) Termin eines Falls/Leads. Für Phase 2.

## Phase 1 — SV-scoped + kaputte Standalone-Consumer (dieser PR, getestet bis 1+)

| # | Surface | Ist (stale) | Soll (kanonisch) |
|---|---|---|---|
| 1 | **Helper** `svTermine` + `.test.ts` | — | neu, TDD |
| 2 | **SV-Kalender** `app/gutachter/kalender/page.tsx` | `v_faelle … WHERE sv_id … sa_unterschrieben=true`, liest `sv_termin`/`gutachter_termin_status` | `svTermine(sv.id, {statuses:[reserviert,bestaetigt,verlegung_pending,verlegt,gegenvorschlag], from:-7d, to:+35d})`; **kein SA-Hardfilter** (Aaron: „alle meine Termine"); Enrichment (claim_nummer/schadensort/kunde) via `v_claim_full` + `leads` + `claim_parties` (Muster aus `heute/page.tsx`); Reshape auf `SVKalenderClient`-Props |
| 3 | **Tagesroute** `app/gutachter/heute/page.tsx` | nutzt schon `assignee_id` (korrekt) | auf `svTermine` vereinheitlichen (identische Quelle wie Kalender), Verhalten unverändert |
| 4 | **Cron** `api/cron/gutachter-erinnerungen/route.ts` | `v_faelle … sv_termin` (Losfahren/5-min Push feuern NIE) | `gutachter_termine` (`assignee_typ='sachverstaendiger'`, Status `bestaetigt`+, `start_zeit` heute); Rückschreiben auf `gutachter_termine.id` (nicht `aktueller_termin_id`) |
| 5 | **Cron** `api/cron/monatsabrechnung/route.ts` | `v_faelle … sv_id + sv_termin` (SV-Abrechnung verliert Fälle) | `gutachter_termine` (`assignee_id`, Monatsfenster, Status abgeschlossen/durchgeführt); `termin_datum` = `gt.start_zeit` |
| 6 | **Cron** `api/cron/no-show-timeout/route.ts` | liest `sv_termin` (Fehl-Storno) | `aktuellerTerminFuerFall` / `gutachter_termine` für „neuer Termin existiert?" |
| 7 | **Storno** `lib/actions/storno-actions.ts` | `sv_termin` → `hoursUntilTermin` (24h-Vertragsstrafe feuert NIE) | `aktuellerTerminFuerFall(fallId)` → echte `start_zeit` |
| 8 | **Admin-Kalender** `app/admin/kalender/page.tsx` + `_components/TageskalenderWidget.tsx` | `v_faelle … sv_termin` | `gutachter_termine` (Zeitfenster, alle SV-Termine), Enrichment claim_nummer/kennzeichen |

**Reihenfolge:** Helper zuerst (Task 1), dann die Consumer je einzeln (isoliert testbar).

### ⚠ Money-Reaktivierungs-Gate — Phase 1a (bauen) vs 1b (Aaron-Freigabe)

Zwei der acht Surfaces schreiben **Geld/Gebühren**, die **aktuell (durch die stale Quelle) NICHT feuern**. Sie zu fixen = **Abrechnung/Gebühren beginnen wieder zu greifen** — reale Aussenwirkung (SVs/Kunden werden plötzlich belastet). Das ist eine Business-Entscheidung, kein stiller Display-Fix:

- **1b-#5 `monatsabrechnung`** — reaktiviert die monatliche SV-Abrechnung (bill't aktuell vermutlich ~nichts, weil `sv_termin` leer). Fix = SVs bekommen wieder Monatsrechnungen. → **Aaron-Freigabe + Rollout-Abstimmung** (evtl. SV-Ankündigung), NICHT stumm mitflippen.
- **1b-#7 `storno-actions` Vertragsstrafe** — reaktiviert die 24h-Storno-Gebühr (feuert aktuell nie → Kunden stornieren spät gratis). Fix = Gebühr greift wieder. → **Aaron-Freigabe.**

**Phase 1a (dieser PR, bauen jetzt):** #1 Helper · #2 SV-Kalender · #3 Tagesroute · #4 `gutachter-erinnerungen` (Reminder feuern wieder — gewollt) · #6 `no-show-timeout` (verhindert Fehl-Storno — reiner Fix) · #8 Admin-Kalender/Widget. Reine Display/Notification/Anti-Fehl-Storno-Fixes, kein Geld-Flip.
**Phase 1b (nach Aaron-OK):** #5 `monatsabrechnung` · #7 storno-Vertragsstrafe — Geld reaktiviert, separat + bewusst.

## Phase 2 — Fall-scoped Consumer (Follow-up, koordiniert; skizziert)

Die ~18 Fall-Detail-Consumer, die pro Fall den aktuellen Termin brauchen, von den stale View-Termin-Spalten auf **`aktuellerTerminFuerFall`** umstellen: `lib/fall/queries.ts` (`FALL_SELECT_KUNDE` + `getFallFor*` — zentraler Blast-Radius), `lib/ai/briefing*.ts`, `app/faelle/[id]/ai-actions.ts`, `lib/makler/queries.ts`, `lib/kunde/jetzt-zu-tun.ts` + `lib/admin/jetzt-zu-tun.ts`, `lib/fall/stepper-state.ts`, `lib/gutachter/subphase.ts`, `lib/autoPhase.ts`, `app/faelle/[id]/FallContext.tsx`, `app/kunde/onboarding/page.tsx`, `app/dispatch|admin/sachverstaendige/[id]/page.tsx`, ICS-Export, `lib/email/google/flows.ts`, `lib/copilot/briefing.ts`, `lib/faq-bot/ask.ts`, `KritischeUpdatesWidget.tsx`.
**Koordination:** die admin/kb-Teile (`fall/queries.ts`, FallContext) überschneiden mit `status-claim-main-phase-domain` (470d55c9, Admin/KB-Rebuild) → vor Phase 2 abstimmen. `v_faelle_mit_aktuellem_termin`-Nicht-Termin-Consumer (`FALL-DATA-OK`, Finanz/Status) bleiben unangetastet.

## Teststrategie (TDD → 1+ nutzbar)

1. **Helper-Unit-Tests** (`sv-termine.test.ts`): assignee-Filter, Status-Set, Zeitfenster, Sortierung — reine Query-Bau-Assertions (fakeDb/Chainable-Mock).
2. **Source-Guard-Tests** (Muster `internal-admin-reads.test.ts`): die migrierten Crons/Storno lesen `gutachter_termine`, **nicht** `v_faelle_mit_aktuellem_termin` für Termin-Daten.
3. **Empirik (Prod, service_role):** die 2 real betroffenen SVs (7 bzw. 1 Termin) — die neue Kalender-/Tagesroute-Query liefert ihre Termine.
4. **Prod-Smoke bis 1+:** als Test-SV Kalender öffnen (Termine sichtbar), Tagesroute starten (Termine routebar), Cron-Dry-Run (Reminder feuert).
5. Voller 7-Punkte-Audit; Build CI-autoritativ.

## Betroffene Dateien (Phase 1)

| Datei | Art |
|---|---|
| `src/lib/termine/sv-termine.ts` (+ `.test.ts`) | neu (Helper) |
| `src/app/gutachter/kalender/page.tsx` | Rewrite Termine-Quelle + Enrichment |
| `src/app/gutachter/heute/page.tsx` | auf `svTermine` vereinheitlichen |
| `src/app/api/cron/gutachter-erinnerungen/route.ts` | Quelle → gutachter_termine |
| `src/app/api/cron/monatsabrechnung/route.ts` | Quelle → gutachter_termine |
| `src/app/api/cron/no-show-timeout/route.ts` | Quelle → gutachter_termine |
| `src/lib/actions/storno-actions.ts` | Termin-Timing → gutachter_termine |
| `src/app/admin/kalender/page.tsx` + `src/app/admin/_components/TageskalenderWidget.tsx` | Quelle → gutachter_termine |
| ggf. `src/app/gutachter/kalender/SVKalenderClient.tsx` | Prop-Anpassung (falls Reshape nötig) |

Kein DDL (kein View-/Schema-Change). Rein Display-/Query-Code.
