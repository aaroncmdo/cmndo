# P4-D — Grüne-Karte-Reminder + checkEmailIsSv (v2-Neubau)

**Datum:** 2026-06-03 · **Strecke:** dispatch-config-unify **P4-D** (2 der 4 Minor-Gaps) · **Lane:** AAR-956 (cdd8f4f3)
**Branch:** `kitta/aar-956-p4d-minor-actions` (off staging mit #2357)

## 1. Problem

Der P3b-Cutover (#2334, `e405398b2`) hat zwei Dispatcher-Features mitgelöscht (Actions waren an die gelöschten `_phases/*` gekoppelt):
- **Grüne-Karte-Reminder** (`setGrueneKarteAngefragt`, AAR-314): bei Auslandskennzeichen die Anfrage beim Deutschen Büro Grüne Karte tracken + KB-Reminder.
- **checkEmailIsSv**: vor Flowlink-Versand warnen, wenn die Kunden-E-Mail einem SV-Account gehört (sonst Zweit-Account).

Handoff-Vorgabe: **NEU bauen, nicht re-wiren** — integriert in den config-getriebenen v2-`DispatchLeadForm`.

## 2. Design

### 2a. checkEmailIsSv (read-only Warnung)
- **Action** `src/app/dispatch/leads/[id]/_actions/email-sv-check.ts` — **1:1 aus History** (`git show e405398b2~1:…`), unverändert: `checkEmailIsSv(email)` → `{ isSv: boolean; sv_id?: string|null }` (prüft `profiles.rolle='sachverstaendiger'` ∧ `sachverstaendige`).
- **Wiring** in `_v2/DispatchFlowlinkPanel.tsx` (hat schon `email` + Warn-Bausteine): `useEffect` ruft `checkEmailIsSv(email)` bei vorhandener E-Mail → wenn `isSv`, amber Warn-Box *„Diese E-Mail gehört einem Sachverständigen — er würde beim Flowlink einen Zweit-Account anlegen statt sich einzuloggen."* **Non-blocking** (Versand bleibt aktiv).

### 2b. Grüne-Karte (Config-Feld + Dispatcher-CTA)
- **Config-Feld (Migration):** `auslandskennzeichen` als `onboarding_felder`-Seed in der `lead-erfassung`/`unfall`-Phase — `typ=segmented` (Ja/Nein), `audience='beide'` (Kunde **und** Dispatcher), `db_target=leads.auslandskennzeichen` (Spalte existiert bereits), `reihenfolge=65` (direkt nach `gegner_kennzeichen`). → erscheint automatisch im v2-Form **und** im §3a/P4-A ①-Feststellung-Step.
- **Action** `src/app/dispatch/leads/[id]/_actions/gruene-karte.ts` — aus History, **NEU: `phase:'phase4'` aus dem Task-Insert entfernt** (Phase-Maschinerie gelöscht); sonst identisch: setzt `leads.gegner_versicherung_anfrage_datum=heute` + idempotenten KB-Reminder-Task (`task_code='gruene-karte-reminder'`, `faellig_am=+10 Tage`, `empfaenger_rolle='kundenbetreuer'`).
- **Wiring (dispatcher-only):** neues `_v2/DispatchGrueneKartePanel.tsx`, registriert im `_v2/dispatch-section-panels.tsx`-`SEKTION_PANELS` unter phase_key `unfall`. Rendert **iff `values.auslandskennzeichen === 'true'`**: wenn `lead.gegner_versicherung_anfrage_datum` gesetzt → „Grüne Karte angefragt am <Datum>, KB-Reminder läuft"; sonst Button *„Beim Deutschen Büro Grüne Karte anfragen"* → `setGrueneKarteAngefragt(leadId)`. Link zu deutsches-buero-gruene-karte.de als Hinweis. **Non-blocking.**

## 3. Migration (Regel 2 — Supabase-Plugin)

`apply_migration` seedet die `auslandskennzeichen`-`onboarding_felder`-Zeile (idempotent via `NOT EXISTS`, Subquery auf die unfall-Phase — kein hardcoded UUID). Danach `list_migrations` → getrackte Version ablesen → File `supabase/migrations/<V>_seed_auslandskennzeichen_feld.sql` exakt so benennen → `execute_sql` verifizieren. Keine DDL (Spalte existiert), reiner Config-Seed — aber via Plugin getrackt (wie der P1-Config-Seed `20260601194358`).

## 4. Files

- **Neu:** `_actions/email-sv-check.ts`, `_actions/gruene-karte.ts`, `_v2/DispatchGrueneKartePanel.tsx`, `supabase/migrations/<V>_seed_auslandskennzeichen_feld.sql`.
- **Geändert:** `_v2/DispatchFlowlinkPanel.tsx` (email-sv-Warnung), `_v2/dispatch-section-panels.tsx` (Panel-Registrierung unter `unfall`).

## 5. Scope / Non-Goals

- **In:** die 2 Actions + Wirings + das Config-Feld. Beide non-blocking.
- **Out:** die anderen 2 Minor-Gaps (lackfarbe_code+imagin, kunde-Geocoding) = separate Cycles. Kein Auto-Trigger (Dispatcher klickt bewusst). Der externe Grüne-Karte-Request läuft weiter manuell über die Website (wir tracken nur + erinnern).

## 6. Smoke

- v2-Form `?` Default: `auslandskennzeichen=Ja` setzen → DispatchGrueneKartePanel erscheint in der unfall-Sektion → „anfragen" → `leads.gegner_versicherung_anfrage_datum` gesetzt + `tasks`-Reminder angelegt (DB-Verify), Datum-Anzeige.
- Flowlink-Panel mit einer SV-E-Mail → amber Warnung erscheint; mit Kunden-E-Mail → keine.
- Config-Feld erscheint auch im `/flow`-①-Step (audience beide).
- Gates: tsc/vitest/token-audit/component-set/knip. PR gegen staging, nicht selbst mergen.
