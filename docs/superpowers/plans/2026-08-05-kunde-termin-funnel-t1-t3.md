# Kunde-Termin-Funnel T1-T3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der ueber den Finder/Flow gewaehlte Gutachtertermin ueberlebt die Lead→Claim-Konversion, ist in der Kunden-Akte sichtbar ("wird bestaetigt"), der Claim-Cursor sagt die Wahrheit (`sv-gesucht`), und Dispatch bekommt eine betreibbare Terminwunsch-Queue mit SLA.

**Architecture:** Drei einzeln shippbare Tranchen (T1 Umhaengen+Sichtbarkeit → T2 Cursor → T3 Dispatch-Queue), je eigener PR gegen `staging`. Neue Logik lebt in einem kleinen Modul `src/lib/leads/uebernehme-lead-termine.ts`; alles andere sind additive Edits an bestehenden Dateien. Spec: `docs/superpowers/specs/2026-08-05-kunde-termin-funnel-design.md`.

**Tech Stack:** Next.js App Router, Supabase (untyped admin-client), vitest, Playwright (Prod-Smoke), Supabase-MCP fuer Migrationen.

## Global Constraints

- Arbeits-Worktree: `.claude/worktrees/kunde-termin-funnel` (Branch je Tranche frisch von `origin/staging`: `kitta/kunde-termin-funnel-t1` usw.). NIE auf `main` pushen (Regel 1).
- DDL/DML-Migrationen NUR via Supabase-MCP `apply_migration` + getrackte Version als Filename committen (Regel 2, Twin-Drift-Schutz). Prod-Ref: `paizkjajbuxxksdoycev`.
- KEIN Direkt-Write auf `claims.operative_status` ausserhalb Engine/sanktioniertem Initial-Insert (Operative-Status-Write-Gate; der Convert-INSERT ist sanktioniert, `.update` nie).
- `gutachter_termine`-FILTER nur ueber kanonische bezug-Achse bzw. `bezugOrExpr`/Dual-Lookup-Helper (Termin-Bezug-Gate). Writes auf Legacy-Spalten sind erlaubt.
- UI-Strings: echte Umlaute; neue i18n-Keys in ALLEN 6 Locales (`src/i18n/messages/{de,en,fr,it,pl,tr}.json` — tatsaechliche Locale-Liste beim ersten Edit verifizieren, `check:i18n` erzwingt Paritaet).
- Server-Actions: Result-Object `{ ok: boolean; error?: string }`, kein throw; `revalidatePath` fuer betroffene Routen.
- Vor jedem Commit: 7-Punkte-Audit im Commit-Body; `npm run build` im Haupt-Checkout ODER CI als Gate (Worktree-tsc floodet — Memory `reference-fresh-worktree-npm-ci-incomplete-tsc`).
- D1-DoD: Journey-Delta (j01 Schritt 2) im T1-PR, BEVOR der Code-Teil des PRs final ist.
- Regel-4: Prod-Smoke je Tranche nach Deploy (Test-Konten, `telefon=NULL`; nie echte Kunden/SVs anfassen — Buchungen bei echten Partner-SVs sind TABU).
- Statusmengen-Vokabular: Termin-Status `dispatch_pending`/`sv_gesucht` (Unterstrich) vs. Claim-Cursor `sv-gesucht` (Bindestrich) — nie verwechseln.

---

## Tranche T1 — Termin ueberlebt die Konversion + Kunde sieht ihn

### Task 1: Helper-Modul `uebernehme-lead-termine.ts` (TDD)

**Files:**
- Create: `src/lib/leads/uebernehme-lead-termine.ts`
- Test: `src/lib/leads/__tests__/uebernehme-lead-termine.test.ts`

**Interfaces:**
- Produces: `TERMINAL_TERMIN_STATUS: readonly string[]` · `istOffenerTerminStatus(status: string | null): boolean` · `hatOffeneLeadTermine(admin: SupabaseClient, leadId: string): Promise<boolean>` · `uebernehmeLeadTermine(admin: SupabaseClient, leadId: string, claimId: string): Promise<{ ok: boolean; count: number; error?: string }>`
- Consumes: nichts (Blatt-Modul).

- [ ] **Step 1: Failing Test schreiben**

```ts
// src/lib/leads/__tests__/uebernehme-lead-termine.test.ts
import { describe, it, expect } from 'vitest'
import { istOffenerTerminStatus, TERMINAL_TERMIN_STATUS } from '../uebernehme-lead-termine'

describe('istOffenerTerminStatus', () => {
  it.each(['dispatch_pending', 'sv_gesucht', 'reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben', 'verlegung_pending'])(
    'offen: %s', (s) => expect(istOffenerTerminStatus(s)).toBe(true),
  )
  it.each(['storniert', 'abgesagt', 'abgelehnt', 'abgeschlossen', 'verlegt'])(
    'terminal/superseded: %s', (s) => expect(istOffenerTerminStatus(s)).toBe(false),
  )
  it('null/leer ist nicht offen', () => {
    expect(istOffenerTerminStatus(null)).toBe(false)
    expect(istOffenerTerminStatus('')).toBe(false)
  })
  it('TERMINAL_TERMIN_STATUS ist die Exklusionsmenge', () => {
    expect([...TERMINAL_TERMIN_STATUS].sort()).toEqual(['abgelehnt', 'abgesagt', 'abgeschlossen', 'storniert', 'verlegt'])
  })
})
```

- [ ] **Step 2: Test rot laufen lassen** — `npx vitest run src/lib/leads/__tests__/uebernehme-lead-termine.test.ts` → FAIL (Modul existiert nicht). ⚠ Im Haupt-Checkout laufen lassen, falls der Worktree kein node_modules hat.

- [ ] **Step 3: Modul implementieren**

```ts
// src/lib/leads/uebernehme-lead-termine.ts
// Kunde-Termin-Funnel T1 (Spec 2026-08-05): gutachter_termine ueberleben die Lead→Claim-
// Konversion. Die Engine schreibt Termine bezug-nativ auf 'lead'; nach der Konversion
// fragt die Kunden-Akte nur fall/claim-Achsen ab. convertLeadToClaim haengt deshalb ALLE
// nicht-terminalen Lead-Termine auf bezug 'claim' um (EIN deterministischer Write-Punkt).
// 'verlegt' zaehlt als superseded (der Nachfolger-Termin traegt den offenen Zustand).

import type { SupabaseClient } from '@supabase/supabase-js'

export const TERMINAL_TERMIN_STATUS = ['storniert', 'abgesagt', 'abgelehnt', 'abgeschlossen', 'verlegt'] as const

export function istOffenerTerminStatus(status: string | null): boolean {
  if (!status) return false
  return !(TERMINAL_TERMIN_STATUS as readonly string[]).includes(status)
}

/** Beide Lead-Verankerungen: bezug-nativ (bezug_typ='lead') ODER legacy (lead_id-Spalte). */
function leadAnkerOrExpr(leadId: string): string {
  return `and(bezug_typ.eq.lead,bezug_id.eq.${leadId}),lead_id.eq.${leadId}`
}

/** Existiert mindestens ein nicht-terminaler lead-verankerter Termin? (Cursor-Input, T2) */
export async function hatOffeneLeadTermine(admin: SupabaseClient, leadId: string): Promise<boolean> {
  const { data } = await admin
    .from('gutachter_termine')
    .select('id')
    .or(leadAnkerOrExpr(leadId))
    .not('status', 'in', `(${TERMINAL_TERMIN_STATUS.join(',')})`)
    .limit(1)
  return (data ?? []).length > 0
}

/** Haengt alle nicht-terminalen lead-verankerten Termine auf den Fall um (bezug 'fall',
 *  fall_id==claims.id claim-first). lead_id wird im selben UPDATE genullt (validate-Trigger
 *  lehnt Doppel-Bezug ab). */
export async function uebernehmeLeadTermine(
  admin: SupabaseClient,
  leadId: string,
  claimId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error } = await admin
    .from('gutachter_termine')
    .update({ bezug_typ: 'fall', bezug_id: claimId, lead_id: null })
    .or(leadAnkerOrExpr(leadId))
    .not('status', 'in', `(${TERMINAL_TERMIN_STATUS.join(',')})`)
    .select('id')
  if (error) return { ok: false, count: 0, error: error.message }
  return { ok: true, count: (data ?? []).length }
}
```

**Zusatz-Schritt (Schisma-Heilung, Spec §4.1):** In `src/lib/termine/bezug-filter.ts` behandeln `bezugOrExpr`/`bezugInExpr` die Achsen `fall` und `claim` als Aequivalenzklasse (IDs identisch, claim-first):

```ts
export function bezugOrExpr(achse: BezugAchse, id: string): string {
  const typen = achse === 'lead' ? 'lead' : 'in.(fall,claim)'
  const typExpr = achse === 'lead' ? `bezug_typ.eq.lead` : `bezug_typ.${typen}`
  return `${achse}_id.eq.${id},and(${typExpr},bezug_id.eq.${id})`
}

export function bezugInExpr(achse: BezugAchse, ids: string[]): string {
  const list = ids.join(',')
  const typExpr = achse === 'lead' ? `bezug_typ.eq.lead` : `bezug_typ.in.(fall,claim)`
  return `${achse}_id.in.(${list}),and(${typExpr},bezug_id.in.(${list}))`
}
```

Bestehende Tests `src/lib/termine/bezug-filter.test.ts` auf die neuen Erwartungs-Strings anpassen + je ein neuer Fall: `bezugOrExpr('fall', 'F-1')` enthaelt `bezug_typ.in.(fall,claim)`; `bezugOrExpr('lead', 'L-1')` bleibt strikt `bezug_typ.eq.lead`.

- [ ] **Step 4: Test gruen** — gleicher Befehl → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/leads/uebernehme-lead-termine.ts src/lib/leads/__tests__/uebernehme-lead-termine.test.ts && git commit` (Message: `feat(termine): Lead-Termin-Uebernahme-Helper (Konversions-Umhaengen T1)` + Audit-Block).

### Task 2: Convert-Integration (non-fatal Nachwirkung)

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts` (nach dem `claim_parties`-Insert / vor dem SP2-T4-`reparatur_termine`-Block, ~Zeile 870; exakte Stelle beim Edit verifizieren)

**Interfaces:**
- Consumes: `uebernehmeLeadTermine` aus Task 1; im Scope vorhandene `admin`, `lead.id` bzw. `leadId`-Variable, `claimId`.
- Produces: Nichts Neues nach aussen; Verhalten: nach jeder Konversion sind offene Termine claim-verankert.

- [ ] **Step 1: Verifikations-Read** — `flow/[token]/page.tsx` Zeile ~180-200 lesen: Der Fokus-Signatur-Kurzschluss muss greifen, sobald ein Claim existiert (dann laufen die Lead-Termin-Reads der Seite post-Konversion nicht mehr). Erwartung bestaetigen und im PR-Body dokumentieren. `findeTerminFuerLead` bleibt unveraendert (Pre-Konversions-Reader).
- [ ] **Step 2: Integration einfuegen** (Muster = SP2-T4-Block direkt darunter, non-fatal):

```ts
  // ─── Kunde-Termin-Funnel T1: offene Lead-Termine auf den Claim umhaengen ────
  // (Spec docs/superpowers/specs/2026-08-05-kunde-termin-funnel-design.md §4.1)
  // Non-fatal: ein Fehler bricht die Konversion NICHT ab; ohne Umhaengen bleibt der
  // Termin fuer die Kunden-Akte unsichtbar (Achsen-Blindheit) — deshalb lautes Log.
  {
    const uebernahme = await uebernehmeLeadTermine(admin, leadId, claimId)
    if (!uebernahme.ok) {
      console.error('[T1] Lead-Termin-Uebernahme fehlgeschlagen (non-fatal):', uebernahme.error)
    }
  }
```

Import oben ergaenzen: `import { uebernehmeLeadTermine } from './uebernehme-lead-termine'`. ⚠ Die lokale Lead-Id-Variable heisst im File ggf. `lead.id`/`input.leadId` — beim Edit den tatsaechlichen Namen verwenden.

- [ ] **Step 3: Bestehende Convert-Tests gruen** — `npx vitest run src/lib/leads/__tests__/convert-lead-to-claim.test.ts` → PASS (falls der Test den admin-Client mockt und am neuen Call scheitert: Mock um `gutachter_termine`-update erweitern, nicht den Call entfernen).
- [ ] **Step 4: Commit** — `feat(convert): offene Lead-Termine bei Konversion auf Claim umhaengen (T1)`.

### Task 3: Backfill-Migration (DML, Bestand)

**Files:**
- Create: `supabase/migrations/<V>_backfill_lead_termine_auf_faelle.sql` (`<V>` = von `apply_migration` getrackte Version, Regel-2-Ablauf!)

- [ ] **Step 1: Vorab-Zaehlung (READ)** via MCP `execute_sql`:

```sql
select count(*) from gutachter_termine g
join claims c on c.lead_id = coalesce(g.bezug_id, g.lead_id)
where (g.bezug_typ = 'lead' or (g.bezug_typ is null and g.lead_id is not null))
  and g.status not in ('storniert','abgesagt','abgelehnt','abgeschlossen','verlegt');
```

Erwartung: niedrige zweistellige Zahl (Audit 04.08.: ~16 bezug-lead + legacy-lead-KB-Termine).

- [ ] **Step 2: Migration anwenden** via MCP `apply_migration` (name `backfill_lead_termine_auf_faelle`):

```sql
-- Kunde-Termin-Funnel T1 Backfill: lead-verankerte Termine (bezug-nativ UND legacy)
-- bereits konvertierter Leads auf den Fall umhaengen (Spec 2026-08-05 §4.1;
-- bezug 'fall' == gelebte Achse, fall_id==claims.id claim-first). lead_id wird
-- genullt (validate-Trigger: kein Doppel-Bezug). Idempotent.
update gutachter_termine g
set bezug_typ = 'fall', bezug_id = c.id, lead_id = null
from claims c
where c.lead_id = coalesce(g.bezug_id, g.lead_id)
  and (g.bezug_typ = 'lead' or (g.bezug_typ is null and g.lead_id is not null))
  and g.status not in ('storniert','abgesagt','abgelehnt','abgeschlossen','verlegt');
```

- [ ] **Step 3: Version ablesen** (`list_migrations`) → File exakt `<V>_backfill_lead_termine_auf_faelle.sql` committen; Nach-Zaehlung (Step-1-Query → 0) via `execute_sql` dokumentieren.
- [ ] **Step 4: Commit** — `chore(mig): Backfill Lead-Termine auf Faelle (T1)`.

### Task 4: Kunde-Loader sieht pending-Termine

**Files:**
- Modify: `src/lib/claims/kunde-claim-view.ts` (svTermin-Query ~Zeile 296-299 + `SV_STATUS_PRIO` ~Zeile 531)

**Interfaces:**
- Produces: `KundeSvTermin` unveraendert, aber `status` kann jetzt `'dispatch_pending' | 'sv_gesucht'` sein — StatusZone (Task 5) verlaesst sich darauf.

- [ ] **Step 1: svTermin-Query erweitern** — in der Query mit `.eq('typ', 'sv_begutachtung')`:

```ts
        .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben', 'dispatch_pending', 'sv_gesucht'])
```

- [ ] **Step 2: Prio-Map erweitern** (bestaetigte Termine gewinnen weiterhin):

```ts
  const SV_STATUS_PRIO: Record<string, number> = { bestaetigt: 1, gegenvorschlag: 2, reserviert: 3, verschoben: 4, dispatch_pending: 5, sv_gesucht: 6 }
```

- [ ] **Step 3: Commit** — `feat(kunde-akte): pending Terminwuensche im Status-Loader sichtbar (T1)`.

### Task 5: "wird bestaetigt"-Darstellung im Stepper

**Files:**
- Modify: `src/components/kunde/claim-view/StatusZone.tsx` (terminInfo-Aufbau ~Zeile 52-64)
- Modify: `src/components/kunde/ClaimStepper.tsx` (TerminInfo-Typ + Terminsektion ~Zeile 27-42/172-215)
- Modify: `src/i18n/messages/*.json` (alle Locales; Key `kunde.fall.stepper.wirdBestaetigt`)

**Interfaces:**
- Consumes: `status.svTermin.status` inkl. neuer Werte (Task 4).
- Produces: `TerminInfo.pending?: boolean`.

- [ ] **Step 1: StatusZone** — beim terminInfo-Aufbau ergaenzen:

```ts
        pending: sv.status === 'dispatch_pending' || sv.status === 'sv_gesucht',
```

- [ ] **Step 2: ClaimStepper** — `TerminInfo` um `pending?: boolean` erweitern; in der Terminsektion: bei `pending` statt `<TerminLiveStatus …/>` ein Badge rendern (Design-Tokens, kein raw-Farb-Ternary — Status-Registry-Gate beachten, `pending`-Slot):

```tsx
                  {terminInfo.pending ? (
                    <span className="inline-flex items-center rounded-full bg-warning-soft text-warning-strong text-[11px] font-medium px-2 py-0.5">
                      {ts('wirdBestaetigt')}
                    </span>
                  ) : (
                    <TerminLiveStatus terminId={terminInfo.terminId} svVorname={terminInfo.svVorname} kundeVorname={terminInfo.kundeVorname} />
                  )}
```

Der Verschieben-Button bleibt an `status === 'bestaetigt'` gekoppelt (kein Edit noetig). SV-Vorname-Zeile: bei `pending` UND fehlendem `svVorname` entfaellt der Suffix automatisch (bestehende `&&`-Logik).

- [ ] **Step 3: i18n** — `kunde.fall.stepper.wirdBestaetigt` in `de.json`: `"wird bestätigt"`; sinngemaess in den uebrigen Locales (en: "awaiting confirmation"; Rest analog uebersetzen). `npm run check:i18n` → gruen.
- [ ] **Step 4: Termine-Hub-Label** — `rg -n "dispatch_pending|statusLabel|status ===" src/app/kunde/termine/KundeTermineClient.tsx src/lib/claims/kunde-termin-entries.ts`. Wo Termin-Status zu Label gemappt wird, `dispatch_pending`/`sv_gesucht` → dasselbe "wird bestätigt"-Label ergaenzen (i18n-Key wiederverwenden bzw. dortige Label-Konvention). Kein Mapping vorhanden → roher Status wird gerendert → Mapping-Zeile ergaenzen.
- [ ] **Step 5: Commit** — `feat(kunde-akte): Wunschtermin-Badge "wird bestätigt" (T1)`.

### Task 6: T1-PR + Journey-Delta + Smoke

- [ ] **Step 1: Journey-Delta** — `docs/fundament/journeys/j01-haftpflicht-standardfall.md` Schritt 2 ergaenzen (Soll): gewaehlter Slot ohne echten SV = Wunschtermin, bleibt am Vorgang sichtbar ("wird bestätigt"), Dispatch finalisiert (Queue T3). Gleicher Commit wie Doku-Anpassung des IST-Abschnitts (Bruchstellen 1-2 aus Spec §1 als "wird mit T1-T3 geschlossen" markieren).
- [ ] **Step 2: PR gegen staging** — Titel `feat(kunde-termine): Lead-Termine ueberleben Konversion + Akte zeigt Wunschtermin (T1)`; Body: Spec-Link, Backfill-Zahlen, Smoke-Plan.
- [ ] **Step 3: Prod-Smoke nach Deploy** —
  (a) DB-Probe: der EXAKTE Loader-Filter (`bezugOrExpr('fall', <claimId>)` + neue Statusliste) via `execute_sql` gegen einen Backfill-Claim (z.B. CLM-2026-01391) → >=1 Row;
  (b) Playwright smoke-kunde@ auf CLM-2026-01603: Akte rendert unveraendert korrekt (Regression);
  (c) Voll-E2E Embed→Dead-Pin→Akte: nur in einer Region OHNE echte Partner-SVs mit vorhandenem sv_leads-Pin; wenn keine solche Region klickbar erreichbar ist, (a)+(b) als Nachweis + Begruendung im PR (echte Partner-SV-Buchungen TABU). Ergebnis im PR dokumentieren.

---

## Tranche T2 — Ehrlicher Initial-Cursor (`sv-gesucht`)

### Task 7: Pure Cursor-Funktion (TDD)

**Files:**
- Create: `src/lib/leads/initial-operative-status.ts`
- Test: `src/lib/leads/__tests__/initial-operative-status.test.ts`
- Modify: `src/lib/leads/convert-lead-to-claim.ts` (~Zeile 451-456 + Exists-Read vor dem claims-Insert)

**Interfaces:**
- Produces: `initialOperativeStatus(i: { gutachtenBereitsErstellt: boolean; svIdFromTermin: string | null; hatOffenenTermin: boolean }): 'gutachten-eingegangen' | 'sv-termin' | 'sv-gesucht' | 'ersterfassung'`
- Consumes: `hatOffeneLeadTermine` (Task 1).

- [ ] **Step 1: Failing Test**

```ts
import { describe, it, expect } from 'vitest'
import { initialOperativeStatus } from '../initial-operative-status'

describe('initialOperativeStatus', () => {
  const base = { gutachtenBereitsErstellt: false, svIdFromTermin: null, hatOffenenTermin: false }
  it('Gutachten liegt vor → gutachten-eingegangen', () =>
    expect(initialOperativeStatus({ ...base, gutachtenBereitsErstellt: true })).toBe('gutachten-eingegangen'))
  it('echter SV am Termin → sv-termin', () =>
    expect(initialOperativeStatus({ ...base, svIdFromTermin: 'sv-1' })).toBe('sv-termin'))
  it('offener Termin ohne SV (Dead-Pin/Wunsch) → sv-gesucht', () =>
    expect(initialOperativeStatus({ ...base, hatOffenenTermin: true })).toBe('sv-gesucht'))
  it('nichts → ersterfassung', () => expect(initialOperativeStatus(base)).toBe('ersterfassung'))
  it('Gutachten schlaegt alles', () =>
    expect(initialOperativeStatus({ gutachtenBereitsErstellt: true, svIdFromTermin: 'sv-1', hatOffenenTermin: true })).toBe('gutachten-eingegangen'))
})
```

- [ ] **Step 2: rot** → **Step 3: Implementierung**

```ts
// src/lib/leads/initial-operative-status.ts
// T2 (Spec 2026-08-05 §4.2): 3-stufiger Initial-Cursor beim Convert. 'sv-gesucht'
// (Bindestrich, claims-Cursor — NICHT der Termin-Status 'sv_gesucht') sagt ehrlich:
// Termin gewuenscht, echter SV steht noch aus. Direkt-INSERT bleibt der sanktionierte
// Initial-Pfad (Operative-Status-Write-Gate gatet nur .update).
export function initialOperativeStatus(i: {
  gutachtenBereitsErstellt: boolean
  svIdFromTermin: string | null
  hatOffenenTermin: boolean
}): 'gutachten-eingegangen' | 'sv-termin' | 'sv-gesucht' | 'ersterfassung' {
  if (i.gutachtenBereitsErstellt) return 'gutachten-eingegangen'
  if (i.svIdFromTermin) return 'sv-termin'
  if (i.hatOffenenTermin) return 'sv-gesucht'
  return 'ersterfassung'
}
```

- [ ] **Step 4: gruen** → **Step 5: Convert verdrahten** — vor dem claims-Insert: `const hatOffenenTermin = await hatOffeneLeadTermine(admin, leadId)`; Zeile 451-456 ersetzen durch:

```ts
  ;(claimsInsert as Record<string, unknown>).operative_status = initialOperativeStatus({
    gutachtenBereitsErstellt: !!input.gutachtenBereitsErstellt,
    svIdFromTermin: input.svIdFromTermin ?? null,
    hatOffenenTermin,
  })
```

(Bestehenden Kommentar-Block ueber der Stelle beibehalten/um T2-Satz ergaenzen.)

- [ ] **Step 6: Parity-Check** — `phaseForOperativeStatus('sv-gesucht')` liefert bereits `{main:'erfassung', sub:'vollmacht_offen'}` (lifecycle.ts, unveraendert — Spec §4.2: Mapping NICHT anfassen). Kein v_claim_phase-Edit.
- [ ] **Step 7: Commit** — `feat(convert): 3-stufiger Initial-Cursor sv-gesucht (T2)`.

### Task 8: Engine-Kanten fuer sv-gesucht verifizieren/ergaenzen

**Files:**
- Read/ggf. Modify: `src/lib/faelle/state-machine.ts` (Transition-Matrix) + zugehoeriger Test
- Read only: `src/app/api/sv-zuweisung/route.ts`

- [ ] **Step 1: Matrix lesen** — `rg -n "sv-gesucht|'sv-termin'|sv-zugewiesen" src/lib/faelle/state-machine.ts`. Pruefen: Ist `sv-gesucht → sv-zugewiesen|sv-termin` eine erlaubte Transition? Und `ersterfassung → sv-gesucht` (fuer spaetere Portal-Buchung T4)?
- [ ] **Step 2: Fehlende Kanten ergaenzen** — NUR falls fehlend, in der bestehenden Matrix-Syntax des Files (Kanten: `'sv-gesucht' → 'sv-termin'`, `'sv-gesucht' → 'sv-zugewiesen'`, `'ersterfassung' → 'sv-gesucht'`), mit Test im bestehenden state-machine-Testfile (gleiches describe-Muster: erlaubte Transition wirft nicht/liefert ok).
- [ ] **Step 3: sv-zuweisung-Pfad verifizieren (read-only)** — bestaetigen, dass `route.ts` den Status via `transitionFallStatus` setzt (C1a #4935); falls dort noch der Cast-WILD-Writer liegt (PR nicht gemergt), NICHT anfassen — im PR-Body vermerken "Transition-Funnel kommt mit C1a" (Lane a6c863e2).
- [ ] **Step 4: Commit + T2-PR** — `feat(state-machine): sv-gesucht-Kanten (T2)`; PR-Body: Cursor-Verhalten + Matrix-Diff; Smoke-Plan: Neue Konversion mit Dead-Pin-Termin → `claims.operative_status='sv-gesucht'` per READ verifizieren (Testfall wie T1-Smoke (c), sonst DB-Probe des juengsten echten Falls dokumentieren).

---

## Tranche T3 — Dispatch-Queue "Terminwuensche" + SLA

### Task 9: Queue-Seite im Dispatch-Portal

**Files:**
- Read (Muster): `src/app/dispatch/rueckrufe/` (komplette Mini-Route: page + Client + actions)
- Create: `src/app/dispatch/terminwuensche/page.tsx`
- Create: `src/app/dispatch/terminwuensche/TerminwunschListe.tsx`
- Modify: Dispatch-Nav (`rg -n "rueckrufe" src/app/dispatch/_components` → dortiges Nav-File, Item "Terminwünsche" mit CalendarClock-Icon daneben einhaengen)

**Interfaces:**
- Produces: Route `/dispatch/terminwuensche`; Row-Shape `TerminwunschRow = { id, start_zeit, status, created_at, ort: string | null, leadId: string | null, claimId: string | null, claimNummer: string | null, kundeName: string | null, quelle: 'dead_pin' | 'portal' }`.
- Consumes: Actions aus Task 10.

- [ ] **Step 1: rueckrufe-Muster lesen** und Auth-Guard/Layout/DataTable-Idiom exakt uebernehmen (`requirePortalAccess(['dispatch','admin'])`-Aequivalent des Musters).
- [ ] **Step 2: Loader (Server-Component)** — Admin-Client-Query:

```ts
  const { data: termine } = await admin
    .from('gutachter_termine')
    .select('id, start_zeit, status, created_at, assignee_typ, assignee_id, bezug_typ, bezug_id')
    .in('status', ['dispatch_pending', 'sv_gesucht'])
    .is('cancelled_at', null)
    .order('created_at', { ascending: true })
```

Kontext-Aufloesung in EINEM Nachlade-Block: `bezug_typ='lead'` → `leads(id, vorname, nachname, schadens_ort, schadens_plz)`; `bezug_typ in ('fall','claim')` → `claims(id, claim_nummer)` + Kunde via `profiles` (fall≡claim, IDs identisch — Spec §4.1). `quelle = assignee_typ === 'sv_lead' ? 'dead_pin' : 'portal'`.

- [ ] **Step 3: Liste rendern** — `shared/DataTable`-Set (KEIN handgerolltes `<table>` — Component-Set-Ratchet): Spalten Alter (relative Zeit; `> 24 h` → `StatusBadge`-Slot `danger`, sonst `pending`), Wunschzeit (Europe/Berlin), Kunde/Ort, Fall (Link auf `/faelle/[id]` wenn claimId), Quelle, Aktionen (Task 10). Leere Queue → `shared/EmptyState`.
- [ ] **Step 4: Commit** — `feat(dispatch): Terminwunsch-Queue Ansicht (T3)`.

### Task 10: Queue-Aktionen (zuweisen / stornieren)

**Files:**
- Create: `src/app/dispatch/terminwuensche/actions.ts`
- Read: `src/app/api/sv-zuweisung/route.ts` (Contract der bestehenden Zuweisung) + `src/lib/termine/engine/state-transitions.ts` (erlaubte Termin-Statuswechsel)

**Interfaces:**
- Produces: `weiseTerminwunschZu(terminId: string, svId: string): Promise<{ ok: boolean; error?: string }>` · `storniereTerminwunsch(terminId: string, grund: string): Promise<{ ok: boolean; error?: string }>`
- Consumes: Termin-Engine-Transitions; Claim-Transition via Engine (`transitionFallStatus`) NUR ueber den bestehenden sv-zuweisung-Pfad.

- [ ] **Step 1: sv-zuweisung-Contract lesen** — Request-Shape der Route notieren. Entscheidungsregel: Haengt der Terminwunsch an einem CLAIM (`bezug_typ='claim'`), laeuft `weiseTerminwunschZu` ueber genau diesen bestehenden Pfad (Server-seitiger Aufruf der geteilten Lib-Funktion, die die Route nutzt — nicht die HTTP-Route selbst; Funktion per `rg -n "export async function" <vom Route-Import verfolgtes Modul>` identifizieren). Haengt er an einem LEAD, wird nur der Termin selbst umgestellt (Konversion uebernimmt spaeter den Rest).
- [ ] **Step 2: Termin-Update via Engine** — Statuswechsel `dispatch_pending|sv_gesucht → bestaetigt` + `assignee {typ:'sachverstaendiger', id: svId}` ueber die Engine-Transition-API aus `state-transitions.ts` (exakte Funktion dort ablesen; ist der Wechsel dort nicht modelliert, Kante analog bestehender ergaenzen + Test — gleiche Datei hat ein Testfile). Kunde-Comms: bestehende Terminbestaetigungs-Notification des sv-zuweisung-Pfads nutzen, KEINE neue Direkt-WA (A3/Outbox-Disziplin).
- [ ] **Step 3: `storniereTerminwunsch`** — Engine-Transition auf `storniert` + `cancelled_at`; Result-Object; `revalidatePath('/dispatch/terminwuensche')` in beiden Actions.
- [ ] **Step 4: SV-Auswahl-UI** — im Listen-Client ein `VersichererSelect`-analoges SV-Select? NEIN — YAGNI: Muster der rueckrufe-Aktionsspalte uebernehmen; SV-Wahl als einfacher Dialog mit SV-Liste (`sachverstaendige` aktiv + Umkreis optional spaeter). Verifizieren, ob `dispatch/sachverstaendige` bereits einen wiederverwendbaren SV-Picker exportiert (`rg -n "SvSelect|SachverstaendigenSelect" src/app/dispatch src/components`) — vorhandenen nutzen statt neu bauen.
- [ ] **Step 5: Commit** — `feat(dispatch): Terminwunsch zuweisen/stornieren via Engine (T3)`.

### Task 11: Eingangs-Notification + 24h-Eskalation

**Files:**
- Modify: `src/lib/sv-matching-modul/buche-deadpin-termin.ts` (nach erfolgreichem Insert)
- Read (Muster): wie benachrichtigt der rueckrufe-Eingang Dispatch? (`rg -n "mitteilung|notification|enqueue|in_app" src/app/dispatch/rueckrufe src/app/embed/gutachter-finder/actions.ts`)
- Modify: `src/lib/tasks/reminder-sender.ts` (Eskalations-Check) — exakten Pfad via `rg --files -g "reminder-sender.ts" src` verifizieren

- [ ] **Step 1: Eingangs-Notification** — im Dead-Pin-Insert-Erfolgsfall dieselbe in_app-Dispatch-Notification ausloesen wie der Rueckruf-Eingang (identisches Muster/Helper; non-fatal try/catch). Text: `Neuer Gutachter-Terminwunsch (<ort>, Wunsch: <datum uhrzeit>)` mit Link `/dispatch/terminwuensche`.
- [ ] **Step 2: Eskalation** — im bestehenden Reminder-/Cron-Lauf ein Check: Terminwuensche `status in ('dispatch_pending','sv_gesucht')`, `created_at < now()-24h`, noch nicht eskaliert (Dedup ueber bestehendes Reminder-Dedup-Muster der Datei — exakt das dortige Idiom kopieren) → einmalige Dispatch-Notification "Terminwunsch wartet > 24 h". Kein neuer Cron, kein neues Schema, wenn das Dedup-Muster der Datei ohne neue Spalte auskommt; sonst STOP und Dedup-Spalte als MCP-Migration (Regel 2) mit `<V>`-File.
- [ ] **Step 3: Commit + T3-PR** — `feat(dispatch): Terminwunsch-Notification + 24h-SLA (T3)`; PR-Body: Screenshot der Queue, Abarbeitungs-Anleitung fuer die 16 Bestands-Wuensche (Test-Leads stornieren), Smoke-Plan.
- [ ] **Step 4: Prod-Smoke nach Deploy** — als test-dispatch@ (`Test1234!`): Queue oeffnen (16 Bestandseintraege sichtbar), einen TEST-Wunsch stornieren (DB-Verifikation `status='storniert'`); Zuweisung an Wegwerf-SV (Rezept Memory `reference-internal-test-account-logins`) an einem Test-Claim end-to-end: Termin `bestaetigt` + Claim-Cursor via Engine transitioniert + Kunde-Notification im Log (Send-Isolation: interne Empfaenger werden gefressen — erwartetes Verhalten dokumentieren).

---

## Self-Review-Ergebnis (Plan gegen Spec)

- Spec §4.1 → Tasks 1-3 · §4.2 → Tasks 7-8 · §4.3 (Loader+Badge-Teil) → Tasks 4-5 · §4.4 → Tasks 9-11 · §7 (Journey/Smoke) → Tasks 6, 8.4, 11.3-4. NICHT in diesem Plan (bewusst): §4.3 Aufgabe/CTA + Kalender-Findung (T4), §4.5 Finder (T5), §4.7 Flotte (T6) — eigene Plaene.
- Kein "TBD"; Verifikations-Reads sind als explizite Schritte mit Erwartung formuliert (heisse Files anderer Lanes werden gelesen, nicht blind editiert).
- Typkonsistenz: `uebernehmeLeadTermine`/`hatOffeneLeadTermine`/`initialOperativeStatus`/`TERMINAL_TERMIN_STATUS` werden ueberall mit identischer Signatur verwendet.
