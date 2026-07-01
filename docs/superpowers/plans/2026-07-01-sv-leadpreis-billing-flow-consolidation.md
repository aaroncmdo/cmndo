# SV-Leadpreis Billing-Flow Konsolidierung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SV-Leadpreis wird nur noch von EINEM Charger (`processCaseBilling`) abgezogen; die drei konkurrierenden Charger werden entfernt, Reader auf `claims.lead_preis_*` umgestellt, Refund auf `revertCaseBilling` vereinheitlicht, `gutachter_abrechnungen` retired.

**Architecture:** `processCaseBilling(fallId)` feuert bereits **primär via State-Machine** (`transitionFallStatus` → BILLABLE_STATUSES) plus `case-billing-batch`-Cron als Backstop; es ist idempotent (`lead_preis_netto != null` → no-op) und schreibt claims-SSoT (MIN-150-Guthaben + `sv_nachzahlung`). Die Konsolidierung ist daher **überwiegend Entfernen** von Redundanz (kein neuer Trigger nötig): (1) `deductLeadpreis`@Zuweisung raus, (2) `uploadGutachten`-Inline-Billing raus, (3) `monatsabrechnung`-Cron raus, (4) Storno-Refund auf `revertCaseBilling` statt `refundLeadpreis`, (5) `gutachter_abrechnungen`-Reader auf `claims.lead_preis_*`, (6) Tabelle retiren.

**Tech Stack:** Next.js 15 (App Router, Server Actions, Route Handlers), Supabase Postgres (RLS, Migrations via `apply_migration`-Plugin), TypeScript, vitest, DB-Smoke (transaktional + `RAISE EXCEPTION 'RESULT ...'` Auto-Rollback).

## Global Constraints

- **⚠️ POST-SECBATCH-REFRESH (hart):** Alle exakten `file:line`-Referenzen und Code-Snippets unten sind gegen `origin/staging` @ 2026-07-01 geschrieben. `release-secbatch1-idor-billing` baut dieselben Files parallel um (IDOR-Guards). **Vor Ausführung JEDES Tasks:** den betroffenen File frisch lesen, Zeilennummern + umgebenden Code neu verankern, Guards von secbatch erhalten. Bau startet erst NACH secbatch-Merge in staging.
- **Regel 1:** Feature-Branch off `staging`, PR gegen `staging`, nie direkt auf `main`.
- **Regel 2:** DDL (Task 6, Tabellen-Retire) NUR via `mcp__plugin_supabase_supabase__apply_migration`; File-Name == getrackte Version (list_migrations lesen). Kein raw-`execute_sql`-DDL, kein CLI-`db push`.
- **Regel 3:** Kein unbegleiteter Stash am Session-Ende.
- **Server-Actions:** Result-Object `{ ok/success, error? }`, kein `throw` mischen; kein const/type-Export aus `'use server'` (AAR-664); non-critical Sub-Sends in try/catch.
- **Umlaute:** UI-Strings mit echten `ä/ö/ü/ß`. Interne docs/Kommentare/Commits: ASCII erlaubt.
- **7-Punkte-Audit** im Commit-Body jedes Commits.
- **Verifikation:** Bei Routen/Server-Actions immer `npm run build` (nicht nur tsc). `NODE_OPTIONS=--max-old-space-size=8192`.
- **DB-Projekt:** `paizkjajbuxxksdoycev` (shared staging+prod — additive/read safe; DDL trifft prod sofort → Task 6 zuletzt + verifiziert).
- **Reihenfolge ist Sicherheit:** erst alle konkurrierenden Charger AUS (kein Doppel-Abzug-Fenster), dann Refund-Unify, dann Reader-Repoint, dann Tabellen-Retire. Nie einen Zwischenstand, in dem ein Reader auf eine leere/gedroppte Quelle zeigt.

---

## Task 0: Kanonischen Trigger verifizieren (Sicherheitsnetz vor jeder Entfernung)

**Files:**
- Read: `src/lib/faelle/state-machine.ts`, `src/lib/abrechnung/process-case-billing.ts`, `src/app/api/cron/case-billing-batch/route.ts`
- Test: `src/lib/abrechnung/process-case-billing.trigger.test.ts` (neu)

**Interfaces:**
- Produces: bestätigte Tatsache "`processCaseBilling(fallId)` wird bei `transitionFallStatus(_, s)` mit `s ∈ BILLABLE_STATUSES` gefeuert" — Grundlage dafür, dass Task 1/2 Billing NICHT verlieren.

- [ ] **Step 1: Trigger-Kette lesen + belegen.** In `state-machine.ts` die Stelle finden, die `processCaseBilling` (oder einen Wrapper) beim Übergang in `gutachten-eingegangen`/BILLABLE_STATUSES aufruft. `BILLABLE_STATUSES` in `case-billing-batch/route.ts:23-37` als Referenzliste. Wenn der State-Machine-Trigger **fehlt** (nur Cron): Task 2 muss stattdessen `processCaseBilling(fallId)` nach der Transition explizit aufrufen — dann Step 3 anpassen. (REFRESH: secbatch kann state-machine anfassen.)

- [ ] **Step 2: Regressions-Test schreiben (Trigger existiert).**
```ts
// src/lib/abrechnung/process-case-billing.trigger.test.ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('leadpreis-billing: kanonischer Trigger', () => {
  it('state-machine feuert processCaseBilling bei BILLABLE-Transition', () => {
    const sm = readFileSync('src/lib/faelle/state-machine.ts', 'utf8')
    // Der Trigger MUSS existieren, sonst verliert Task 2 das Billing.
    expect(sm).toMatch(/processCaseBilling|case-billing/)
  })
})
```

- [ ] **Step 3: Test laufen lassen.** `npx vitest run src/lib/abrechnung/process-case-billing.trigger.test.ts` → PASS. Falls FAIL: Trigger fehlt → Task 2 auf explizites `processCaseBilling(fallId)` umstellen (im Task-2-Body dokumentieren), Test-Regex anpassen.

- [ ] **Step 4: Commit.**
```bash
git add src/lib/abrechnung/process-case-billing.trigger.test.ts
git commit -m "test(billing): verankere kanonischen processCaseBilling-Trigger (Sicherheitsnetz)"
```

---

## Task 1: `deductLeadpreis`@Zuweisung entfernen (Charger #1 aus)

**Files:**
- Modify: `src/app/api/sv-zuweisung/route.ts` (Aufruf ~:476 — REFRESH)
- Test: `src/app/api/sv-zuweisung/no-double-charge.test.ts` (neu)

**Interfaces:**
- Consumes: Task 0 (Billing feuert später via State-Machine).
- Produces: `sv-zuweisung` zieht KEIN Guthaben mehr ab.

- [ ] **Step 1: Failing-Guard-Test schreiben.**
```ts
// src/app/api/sv-zuweisung/no-double-charge.test.ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('sv-zuweisung: kein Leadpreis-Abzug bei Zuweisung', () => {
  it('ruft deductLeadpreis nicht mehr auf', () => {
    const src = readFileSync('src/app/api/sv-zuweisung/route.ts', 'utf8')
    expect(src).not.toMatch(/deductLeadpreis/)
  })
})
```

- [ ] **Step 2: Test laufen → FAIL** (`deductLeadpreis` noch vorhanden). `npx vitest run src/app/api/sv-zuweisung/no-double-charge.test.ts`.

- [ ] **Step 3: Aufruf + Import entfernen.** In `sv-zuweisung/route.ts`: die Zeile `deductLeadpreis(bestSv.id, fallId, Number(fallFullClaim.regulierungs_betrag), ...).catch(...)` (samt umgebendem `try/if`, falls nur dafür da) löschen; `deductLeadpreis` aus dem `import { triggerSV01, deductLeadpreis } from '@/lib/gutachterTasking'` streichen (→ `import { triggerSV01 } from '@/lib/gutachterTasking'`). (REFRESH: exakte Zeilen gegen post-secbatch neu verankern; secbatch-Guards im Umfeld erhalten.)

- [ ] **Step 4: Test laufen → PASS.** Plus `npx tsc --noEmit` (Route → danach `npm run build`).

- [ ] **Step 5: Commit** mit 7-Punkte-Audit-Body.
```bash
git add src/app/api/sv-zuweisung/route.ts src/app/api/sv-zuweisung/no-double-charge.test.ts
git commit -m "refactor(billing): kein Leadpreis-Abzug bei SV-Zuweisung (Charger #1 raus)"
```

---

## Task 2: `uploadGutachten`-Inline-Billing entfernen (Charger #2 aus)

**Files:**
- Modify: `src/app/gutachter/fall/[id]/actions.ts` (Block "Automatische Abrechnung" ~:178-215 — REFRESH; auch von #3357 + secbatch berührt)
- Test: `src/app/gutachter/fall/no-inline-billing.test.ts` (neu)

**Interfaces:**
- Consumes: Task 0 (`transitionFallStatus('gutachten-eingegangen')` bei :94 triggert das kanonische Billing).
- Produces: `uploadGutachten` schreibt weder `gutachter_abrechnungen` noch zieht es Guthaben ab; Gutachten-Upload triggert Billing nur noch über die (schon vorhandene) Status-Transition.

- [ ] **Step 1: Failing-Guard-Test schreiben.**
```ts
// src/app/gutachter/fall/no-inline-billing.test.ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('uploadGutachten: kein Inline-Billing', () => {
  const src = readFileSync('src/app/gutachter/fall/[id]/actions.ts', 'utf8')
  it('schreibt nicht mehr in gutachter_abrechnungen', () => {
    expect(src).not.toMatch(/from\('gutachter_abrechnungen'\)\s*\.insert/)
  })
  it('zieht kein werbebudget_guthaben_netto mehr inline ab', () => {
    expect(src).not.toMatch(/getLeadPriceFromTable\(betrag/)
  })
})
```

- [ ] **Step 2: Test laufen → FAIL.** `npx vitest run src/app/gutachter/fall/no-inline-billing.test.ts`.

- [ ] **Step 3: Inline-Block entfernen.** Den gesamten `if (svData) { ... }`-"Automatische Abrechnung"-Block (Leadpreis-Berechnung, `gutachter_abrechnungen`-Insert, `sachverstaendige`-Guthaben-Update) samt vorgelagertem `const { data: svData } = ...select('...werbebudget_guthaben_netto, paket_faelle_genutzt...')`-Read löschen. Import `getLeadPriceFromTable` aus dieser Datei entfernen (wird dann ungenutzt). `transitionFallStatus(fallId, 'gutachten-eingegangen', ...)` (:94) **bleibt** — das ist der kanonische Trigger. Falls Task 0 ergab, dass kein State-Machine-Trigger existiert: hier `const { processCaseBilling } = await import('@/lib/abrechnung/process-case-billing'); processCaseBilling(fallId).catch(() => {})` nach der Transition ergänzen. (REFRESH.)

- [ ] **Step 4: Test → PASS**, `npm run build` grün (Server-Action-File).

- [ ] **Step 5: Commit** (7-Punkte-Audit).
```bash
git add src/app/gutachter/fall/[id]/actions.ts src/app/gutachter/fall/no-inline-billing.test.ts
git commit -m "refactor(billing): uploadGutachten-Inline-Billing raus (Charger #2, kanonisch via Status-Transition)"
```

---

## Task 3: Storno-Refund auf `revertCaseBilling` vereinheitlichen + `gutachterTasking`-Billing entfernen

**Files:**
- Modify: `src/lib/actions/dispatch-fall-actions.ts` (Storno-Pfad ~:225-232 — REFRESH)
- Modify: `src/lib/gutachterTasking.ts` (entfernt: `calculateLeadpreis`, `deductLeadpreis`, `refundLeadpreis`)
- Test: `src/lib/gutachterTasking.no-billing.test.ts` (neu)

**Interfaces:**
- Consumes: `revertCaseBilling(fallId: string, stornoGrund: string, stornoDurchUserId: string): Promise<RevertResult>` aus `src/lib/abrechnung/revert-case-billing.ts` — bucht Werbebudget zurück + setzt `claims.lead_preis_netto/guthaben_verrechnet_netto/sv_nachzahlung_netto` zurück + Abrechnungs-Side-Effect.
- Produces: `gutachterTasking` enthält keine Leadpreis-/Guthaben-Logik mehr; Storno refundet claims-basiert.

- [ ] **Step 1: Prüfen ob `revertCaseBilling` im Storno-Pfad schon läuft.** In `dispatch-fall-actions.ts` grep nach `revertCaseBilling` UND `refundLeadpreis`. Wenn `revertCaseBilling` beim Storno bereits aufgerufen wird → `refundLeadpreis`-Aufruf ist Doppel-Refund → nur entfernen. Wenn NICHT → `refundLeadpreis(...)`-Aufruf durch `const { revertCaseBilling } = await import('@/lib/abrechnung/revert-case-billing'); await revertCaseBilling(fallId, stornoGrund ?? 'Storno', stornoDurchUserId).catch(err => console.error('[storno] revertCaseBilling', err))` ersetzen (Storno-Grund + User-Id aus dem umgebenden Action-Scope; REFRESH exakte Var-Namen).

- [ ] **Step 2: Failing-Test schreiben.**
```ts
// src/lib/gutachterTasking.no-billing.test.ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('gutachterTasking: keine Leadpreis-/Guthaben-Logik mehr', () => {
  const gt = readFileSync('src/lib/gutachterTasking.ts', 'utf8')
  it.each(['calculateLeadpreis', 'deductLeadpreis', 'refundLeadpreis'])('exportiert %s nicht mehr', (fn) => {
    expect(gt).not.toMatch(new RegExp(`function ${fn}\\b`))
  })
  it('dispatch-storno nutzt revertCaseBilling statt refundLeadpreis', () => {
    const d = readFileSync('src/lib/actions/dispatch-fall-actions.ts', 'utf8')
    expect(d).not.toMatch(/refundLeadpreis/)
  })
})
```

- [ ] **Step 3: Test → FAIL.** `npx vitest run src/lib/gutachterTasking.no-billing.test.ts`.

- [ ] **Step 4: Entfernen.** In `gutachterTasking.ts` die drei Funktionen `calculateLeadpreis`, `deductLeadpreis`, `refundLeadpreis` (samt Helper wie `decrement_guthaben`-Aufrufe, die nur dort genutzt werden) löschen. In `dispatch-fall-actions.ts` den `refundLeadpreis`-Import/Aufruf entfernen (Step 1). `grep -rn "deductLeadpreis\|refundLeadpreis\|calculateLeadpreis" src/` → 0 Treffer.

- [ ] **Step 5: Test → PASS**, `npm run build` grün.

- [ ] **Step 6: Commit** (7-Punkte-Audit).
```bash
git add src/lib/gutachterTasking.ts src/lib/actions/dispatch-fall-actions.ts src/lib/gutachterTasking.no-billing.test.ts
git commit -m "refactor(billing): Storno-Refund via revertCaseBilling; gutachterTasking-Billing raus"
```

---

## Task 4: `monatsabrechnung`-Cron entfernen (Charger #4, deprecated AAR-925)

**Files:**
- Delete: `src/app/api/cron/monatsabrechnung/route.ts`
- Test: `src/app/api/cron/no-monatsabrechnung.test.ts` (neu)

**Interfaces:**
- Produces: kein deprecated Monats-Cron mehr; VPS-Crontab-Eintrag muss extern entfernt werden (Aaron/Infra — im Commit-Body notieren).

- [ ] **Step 1: Failing-Test.**
```ts
// src/app/api/cron/no-monatsabrechnung.test.ts
import { existsSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
describe('monatsabrechnung-Cron entfernt', () => {
  it('Route existiert nicht mehr', () => {
    expect(existsSync('src/app/api/cron/monatsabrechnung/route.ts')).toBe(false)
  })
})
```

- [ ] **Step 2: Test → FAIL.** `npx vitest run src/app/api/cron/no-monatsabrechnung.test.ts`.

- [ ] **Step 3: Route löschen.** `git rm src/app/api/cron/monatsabrechnung/route.ts`. Prüfen ob `gutachter_monatsabrechnungen`/`gutachter_abrechnungspositionen` noch andere Consumer haben (`grep -rn`); wenn 0 → im Commit-Body als Retire-Kandidat notieren (separate DDL, nicht hier).

- [ ] **Step 4: Test → PASS**, `npm run build` grün.

- [ ] **Step 5: Commit** (7-Punkte-Audit; Body: "VPS-Crontab-Eintrag /api/cron/monatsabrechnung entfernen — Aaron/Infra").
```bash
git add -A
git commit -m "chore(billing): monatsabrechnung-Cron entfernt (deprecated AAR-925, System-B ist kanonisch)"
```

---

## Task 5: `gutachter_abrechnungen`-Reader auf `claims.lead_preis_*` umstellen

**Files (je REFRESH — secbatch berührt mehrere):**
- Modify: `src/lib/analytics/finance.ts` (`.from('gutachter_abrechnungen').select('...leadpreis...')`)
- Modify: `src/lib/analytics/sv-performance.ts` (`.select('leadpreis')`)
- Modify: `src/lib/finance/fall-finanzen.ts`
- Modify: `src/app/gutachter/abrechnung/page.tsx` (SV-Portal Abrechnungsübersicht — nutzer-sichtbar, Umlaute!)
- Modify: `src/app/gutachter/fall/[id]/page.tsx` + `_components/AbrechnungsCard.tsx`
- Modify: `src/lib/gutachter/abrechnung.ts` (Reader-Helper/Typen)
- Test: `src/lib/analytics/leadkosten-source.test.ts` (neu)

**Interfaces:**
- Consumes: claims-SSoT-Felder `lead_preis_netto` (Leadpreis pro Fall), `lead_preis_typ` ('paket'|'einzel'), `lead_preis_berechnet_am` (Monat/Datum), `sv_nachzahlung_netto`, `guthaben_verrechnet_netto`.
- Produces: alle SV-Kosten/Leadpreis-Anzeigen leiten aus `claims` ab; keine `gutachter_abrechnungen`-Reads mehr.

- [ ] **Step 1: Mapping-Tabelle festhalten (im Task-Kommentar):** `gutachter_abrechnungen.leadpreis` → `claims.lead_preis_netto`; `.preistyp` → `claims.lead_preis_typ`; `.monat`/`created_at` → `claims.lead_preis_berechnet_am`; `.sv_id` → `claims.sv_id`; `.fall_id` → `claims.id`/`resolveClaimId`. Refund-Zustand: `revertCaseBilling` setzt `lead_preis_netto=0` → "refunded" = `lead_preis_netto = 0 AND storniert`. Vor dem Repoint verifizieren, dass jede heute angezeigte Spalte ein claims-Pendant hat (Spec §5 D4 Impl-Auflage). Fehlt eine reine Anzeige-Historie → als Read-View **auf** claims bauen (kein paralleler Write-Ledger).

- [ ] **Step 2: Failing-Test (Analytics-Quelle).**
```ts
// src/lib/analytics/leadkosten-source.test.ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
describe('Analytics liest Leadkosten aus claims, nicht gutachter_abrechnungen', () => {
  it.each([
    'src/lib/analytics/finance.ts',
    'src/lib/analytics/sv-performance.ts',
    'src/lib/finance/fall-finanzen.ts',
  ])('%s referenziert gutachter_abrechnungen nicht mehr', (f) => {
    expect(readFileSync(f, 'utf8')).not.toMatch(/gutachter_abrechnungen/)
  })
})
```

- [ ] **Step 3: Test → FAIL.**

- [ ] **Step 4: Reader umstellen (pro File).** Jeden `.from('gutachter_abrechnungen')`-Read auf einen `claims`-Read mit den gemappten Feldern ändern (SV-scoped via `sv_id`, Zeitfenster via `lead_preis_berechnet_am`, `not('lead_preis_netto','is',null)` — Muster analog `LeadPreiseVerteilungWidget` in #3337). SV-Portal-UI (`abrechnung/page.tsx`, `AbrechnungsCard.tsx`): Umlaute in nutzersichtbaren Strings prüfen. (REFRESH je File; secbatch-Guards/Selects erhalten. Falls ein File > wenige Reads betrifft, als eigenen Commit trennen.)

- [ ] **Step 5: Test → PASS**, `npm run build` grün. DB-Smoke: als SV (JWT-Sim, `set local role authenticated` + claims-sv) die claims-Query gegenprüfen, dass sie die SV-eigenen Leadpreise liefert.

- [ ] **Step 6: Commit(s)** (7-Punkte-Audit; ggf. pro File/Domäne getrennt).
```bash
git add src/lib/analytics/finance.ts src/lib/analytics/sv-performance.ts src/lib/finance/fall-finanzen.ts src/lib/analytics/leadkosten-source.test.ts
git commit -m "refactor(billing): Analytics-Leadkosten aus claims.lead_preis_* (statt gutachter_abrechnungen)"
# + separater Commit fuer SV-Portal-UI-Reader
```

---

## Task 6: `gutachter_abrechnungen` retiren (DDL — nur wenn 0 Referenzen)

**Files:**
- Create: `supabase/migrations/<V>_retire_gutachter_abrechnungen.sql`
- Verify: `grep -rn "gutachter_abrechnungen" src/` == 0 (außer generierten `database.types.ts`)

**Interfaces:**
- Consumes: Task 1–5 abgeschlossen (kein Writer, kein Reader mehr).

- [ ] **Step 1: Referenz-Gate.** `grep -rn "gutachter_abrechnungen" src/` — nur `src/lib/supabase/database.types.ts` darf übrig sein. Sonst STOP (ein Reader/Writer wurde übersehen → zurück zu Task 5). `faelle/[id]/_actions/core.ts` Cascade-Delete-Liste: `gutachter_abrechnungen`-Eintrag entfernen.

- [ ] **Step 2: Live-Zeilen prüfen.** `execute_sql` (READ): `SELECT count(*) FROM gutachter_abrechnungen;` — 0 erwartet (Prod-Befund 01.07.). Falls > 0: kein Drop, sondern zu einer claims-abgeleiteten View umbauen (Rücksprache Aaron).

- [ ] **Step 3: DDL via Plugin.** `apply_migration({ name: "retire_gutachter_abrechnungen", query: "DROP TABLE IF EXISTS public.gutachter_abrechnungen;" })`. Dann `list_migrations` → getrackte Version `<V>` ablesen.

- [ ] **Step 4: Migration-File committen** als `supabase/migrations/<V>_retire_gutachter_abrechnungen.sql` (Name == getrackte Version, Twin-Drift vermeiden). `generate_typescript_types` regenerieren → `database.types.ts` (kein `gutachter_abrechnungen` mehr).

- [ ] **Step 5: Verifizieren.** `execute_sql` (READ): Tabelle weg. `npm run build` grün (Types konsistent).

- [ ] **Step 6: Commit** (7-Punkte-Audit).
```bash
git add supabase/migrations/*_retire_gutachter_abrechnungen.sql src/lib/supabase/database.types.ts src/app/faelle/[id]/_actions/core.ts
git commit -m "chore(billing): gutachter_abrechnungen retired (0 Reader/Writer/Zeilen, claims ist SSoT)"
```

---

## Task 7: End-to-End-Smoke — genau EIN Abzug + korrekter Refund

**Files:**
- Test: DB-Smoke (transaktional, Auto-Rollback) — als committetes SQL unter `docs/superpowers/plans/smoke/leadpreis-single-charge.sql` dokumentiert.

**Interfaces:**
- Consumes: Task 1–6.

- [ ] **Step 1: Smoke schreiben.** Transaktional (`BEGIN ... RAISE EXCEPTION 'RESULT ...' ... ROLLBACK`): Test-SV + Test-Claim anlegen; Lifecycle simulieren (Zuweisung → `transitionFallStatus('gutachten-eingegangen')` → Billing → Storno). Assertions: (a) nach Billing genau **ein** Guthaben-Abzug (`guthaben_verrechnet_netto = MIN(150, ...)`, `lead_preis_netto` gesetzt, `sv_nachzahlung_netto` korrekt); (b) `processCaseBilling` erneut aufgerufen = no-op (Idempotenz); (c) nach `revertCaseBilling` Werbebudget zurückgebucht + `lead_preis_netto = 0`.

- [ ] **Step 2: Smoke laufen** (`execute_sql`) — RESULT-Assertions prüfen; Auto-Rollback lässt Prod unberührt.

- [ ] **Step 3: Per-SV-Browser-E2E** (falls Playwright-Setup vorhanden): SV-Login → Fall → Abrechnungsübersicht zeigt genau einen Leadpreis (aus claims). Sonst manueller Smoke-Vermerk.

- [ ] **Step 4: Commit** (Smoke-SQL + Ergebnis-Vermerk).
```bash
git add docs/superpowers/plans/smoke/leadpreis-single-charge.sql
git commit -m "test(billing): E2E-Smoke — genau ein Leadpreis-Abzug + Refund (claims-SSoT)"
```

---

## Self-Review (gegen Spec)

**Spec-Coverage:** §4 Ziel-Arch → Task 1 (#1 raus), Task 2 (#2 raus), Task 4 (#4 raus), Task 3 (Refund-Unify), Task 5 (Reader-Repoint), Task 6 (Retire). D1 Zeitpunkt (case-billing via State-Machine) → Task 0+2. D2 Schadenhöhe (`schadens_hoehe_netto ?? gutachten`) → bereits in `processCaseBilling` (kein Task nötig, unverändert kanonisch). D3 Guthaben MIN(150) → unverändert `processCaseBilling` (Task 1/2/3 entfernen nur die vollen Abzüge). D4 Ledger claims-SSoT → Task 5+6. Erfolgskriterien §8 → Task 7. **Keine Lücke.**

**Placeholder-Scan:** Keine TBD/„später". Die REFRESH-Marker sind bewusste, von Aaron freigegebene Caveats (secbatch-Kollision), keine offenen Enden.

**Typ-Konsistenz:** `revertCaseBilling(fallId, stornoGrund, stornoDurchUserId)`, `processCaseBilling(fallId)`, claims-Felder `lead_preis_netto/-typ/-berechnet_am/sv_nachzahlung_netto/guthaben_verrechnet_netto` — durchgängig gleich benannt (verifiziert gegen die gelesenen Files).

**Scope:** Ein Subsystem (SV-Leadpreis-Charging), ein Plan. OK.
