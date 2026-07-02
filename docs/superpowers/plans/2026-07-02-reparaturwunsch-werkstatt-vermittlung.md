# Reparaturwunsch + Werkstatt-Vermittlung (Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erfasse den Abrechnungs-Intent `reparaturwunsch` (immer, lead→claim) und lasse Kunde/Gutachter/KB/Dispatcher — nur wenn Reparatur gewuenscht und noch keine Werkstatt hinterlegt — eine Partner-Werkstatt (5 naechste) vermitteln, die den Auftrag im Portal + per Email erhaelt.

**Architecture:** Intent-Feld getrennt vom operativen Vermittlungs-Status. Ein geteilter Vermittlungs-Kern (`vermittlung-core.ts`) kapselt Gate + Write + Notify; duenne rollen-gescopte Server-Actions rufen ihn auf. Erfassung ueber DB-Config (`onboarding_felder`), nicht Formular-Code. Partner-Zustellung durch Ernte einer fertigen, unmerged Portal-Inbox-Slice.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres + RLS + SECURITY-DEFINER-RPC), TypeScript, vitest, Tailwind v4 + Claimondo-Token-System, `@/components/shared/*` + `primitives/*`.

## Global Constraints

- **DDL nur via Supabase-Plugin** (`apply_migration`), nie CLI/raw-SQL. Nach apply: `list_migrations` → getrackte Version `<V>` ablesen → File als `supabase/migrations/<V>_<name>.sql` committen (Regel 2, Twin-Drift vermeiden). `execute_sql` nur READ.
- **Nie auf `main`/`staging` direkt pushen** — Arbeit auf `kitta/reparaturwunsch-werkstatt-vermittlung`, PR gegen `staging`.
- **7-Punkte-Audit vor jedem Commit**, Audit-Status im Commit-Body (Format siehe AGENTS.md).
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` (nie `throw` mischen); Non-Critical-Sends (WA/Email/Mitteilung) in try/catch; `revalidatePath` fuer betroffene Routen.
- **Umlaute:** alle nutzersichtbaren Strings (TSX, Email, WA) mit echten `ä/ö/ü/ß`. Backend/Comments/Docs: ASCII erlaubt.
- **Komponenten-Set:** `@/components/shared/*` + `primitives/*` wiederverwenden; kein handgerolltes Button-/Card-/Table-Markup. Claimondo-Token-Farben, keine Inline-Hex.
- **Projekt-Ref Supabase:** `paizkjajbuxxksdoycev`. **Test:** `npx vitest run <pfad>`. **Build:** `npm run build`. **Ratchets:** `npm run check:token-audit`, `npm run check:component-set -- --ratchet`, `npm run check:knip -- --ratchet`.
- **Bestehende, wiederverwendete Bausteine (staging, NICHT neu bauen):** `findWerkstaetten`/`WerkstattFinderRow`/`rankWerkstaetten` (`src/lib/werkstatt/finder.ts`), `WerkstattFinder` (`src/components/werkstatt/finder/WerkstattFinder.tsx`, Props `{werkstaetten,onSelect,selectedId?,loading?}`), `notifyKundeWerkstattVermittlung`, `notifyWerkstattNeuerAuftrag`, `requireRole(roles)` (`@/lib/auth/guards`, liefert `{success,error,supabase,user}`), `createAdminClient` (`@/lib/supabase/admin`), `createClient` (`@/lib/supabase/server`).

---

## File Structure

**Neu:**
- `src/lib/werkstatt/vermittlung-core.ts` — Gate (`brauchtWerkstattVermittlung`), Patch-Bau (`buildZuweisungPatch`, parametrisiert), Write+Notify-Kern (`assignReparaturWerkstatt`), Anker-Resolver (`findReparaturWerkstaettenForTarget`). Plain server-only Modul (NICHT `'use server'` — exportiert Typen/Konstanten/sync-Funktionen).
- `src/lib/werkstatt/__tests__/vermittlung-core.test.ts` — Unit-Tests Gate + Patch.
- `src/lib/werkstatt/reparatur-auftraege.ts` — Werkstatt-Inbox-Reader (RPC). *(Ernte)*
- `src/components/werkstatt/WerkstattReparaturAuftraege.tsx` — Inbox-Tabelle. *(Ernte)*
- `src/app/werkstatt/(shell)/auftraege/page.tsx` — Werkstatt-Inbox-Seite. *(Ernte)*
- `src/app/gutachter/fall/[id]/_components/WerkstattVermittelnCard.tsx` — Gutachter-Picker-Card.
- `src/app/gutachter/fall/[id]/_components/WerkstattVermittelnCard.client.tsx` *(falls Client-Interaktion getrennt werden muss; sonst Card selbst `'use client'`)*.
- `src/app/flow/[token]/FlowWerkstattStep.tsx` — Kunde-Flow-Picker-Step.

**Modifiziert:**
- `supabase/migrations/<V>_reparaturwunsch_vermittlung.sql` — neue Spalten + quelle-CHECK. *(Migration)*
- `supabase/migrations/<V>_reparaturwunsch_config_felder.sql` — 3 `onboarding_felder`-Zeilen. *(Migration)*
- `supabase/migrations/<V>_get_werkstatt_reparatur_auftraege.sql` — RPC. *(Ernte)*
- `src/lib/leads/convert-lead-to-claim.ts` — 3 Felder in claimsInsert (bei :458).
- `src/app/dispatch/leads/[id]/_actions/werkstatt-vermittlung.ts` — auf Kern refactoren, limit→5.
- `src/app/dispatch/leads/[id]/_actions/werkstatt-vermittlung-patch.ts` — **geloescht** (in Kern gewandert).
- `src/lib/werkstatt/notify-kunde-vermittlung.ts` — optionales `imAuftrag`-Wording.
- `src/lib/werkstatt/notify-werkstatt-auftrag.ts` — In-App-Mitteilung zusaetzlich.
- `src/lib/mitteilungen/types.ts` — `EmpfaengerRolle += 'werkstatt'`. *(Ernte-Abhaengigkeit)*
- `src/components/werkstatt/WerkstattShell.tsx` — Nav-Eintrag `/werkstatt/auftraege`. *(⚠ Konflikt Session 2cc586af — nach deren Merge)*
- `src/app/gutachter/fall/[id]/actions.ts` — `vermittleWerkstattAlsGutachter`.
- `src/app/gutachter/fall/[id]/FallDetailClient.tsx` + `page.tsx` — Card einhaengen + Bedarf/Werkstaetten laden.
- `src/app/faelle/[id]/_actions/` (neu `werkstatt.ts`) + Uebersicht/Sidebar — KB/Admin-Picker.
- `src/app/faelle/[id]/_actions/stammdaten.ts` — `reparaturwunsch`/`reparatur_vermittlung_status` in `FALL_EDITABLE_FIELDS`.
- `src/app/flow/[token]/FlowWizardKfz.tsx` — StepId + STEPS + Switch. *(⚠ aar-956-Kollision — zuletzt + rebase)*
- `src/app/flow/[token]/self-service-actions.ts` — `ladeWerkstaettenFlow` + `waehleWerkstattFlow`.

---

## Phase 0 — Datenmodell (DDL)

### Task 0.1: Spalten + quelle-CHECK-Erweiterung (Migration)

**Files:**
- Create: `supabase/migrations/<V>_reparaturwunsch_vermittlung.sql`

**Interfaces:**
- Produces: Spalten `reparaturwunsch`, `reparatur_vermittlung_status`, `reparatur_werkstatt_extern` auf `leads` + `claims`; erweiterte CHECK `reparatur_werkstatt_quelle`.

- [ ] **Step 1: DDL formulieren** (Datei-Inhalt, den wir gleich via Plugin anwenden):

```sql
-- Intent + operativer Vermittlungs-Status, symmetrisch auf leads + claims.
alter table public.leads
  add column if not exists reparaturwunsch text
    check (reparaturwunsch is null or reparaturwunsch in ('reparatur','fiktiv','unentschieden')),
  add column if not exists reparatur_vermittlung_status text not null default 'offen'
    check (reparatur_vermittlung_status in ('offen','eigene','vermittelt','abgelehnt')),
  add column if not exists reparatur_werkstatt_extern text;

alter table public.claims
  add column if not exists reparaturwunsch text
    check (reparaturwunsch is null or reparaturwunsch in ('reparatur','fiktiv','unentschieden')),
  add column if not exists reparatur_vermittlung_status text not null default 'offen'
    check (reparatur_vermittlung_status in ('offen','eigene','vermittelt','abgelehnt')),
  add column if not exists reparatur_werkstatt_extern text;

-- quelle um gutachter/kb erweitern (bestehender CHECK aus 20260628215921 droppen + neu).
alter table public.leads  drop constraint if exists leads_reparatur_werkstatt_quelle_check;
alter table public.claims drop constraint if exists claims_reparatur_werkstatt_quelle_check;
alter table public.leads  add constraint leads_reparatur_werkstatt_quelle_check
  check (reparatur_werkstatt_quelle is null or reparatur_werkstatt_quelle in ('dispatcher','kunde','embed','gutachter','kb'));
alter table public.claims add constraint claims_reparatur_werkstatt_quelle_check
  check (reparatur_werkstatt_quelle is null or reparatur_werkstatt_quelle in ('dispatcher','kunde','embed','gutachter','kb'));
```

> Vor Step 1 verifizieren: `execute_sql` (READ) `select conname from pg_constraint where conname ilike '%reparatur_werkstatt_quelle%';` — die exakten Constraint-Namen ablesen und im DROP oben einsetzen (Namen koennen von der Vermutung abweichen).

- [ ] **Step 2: Anwenden via Plugin**

`apply_migration({ name: "reparaturwunsch_vermittlung", query: "<DDL oben>" })`

- [ ] **Step 3: Getrackte Version ablesen**

`list_migrations` → die neu vergebene Version `<V>` notieren.

- [ ] **Step 4: Verifizieren (READ)**

`execute_sql`:
```sql
select table_name, column_name from information_schema.columns
where table_schema='public' and table_name in ('leads','claims')
  and column_name in ('reparaturwunsch','reparatur_vermittlung_status','reparatur_werkstatt_extern')
order by table_name, column_name;
```
Expected: 6 Zeilen (3 pro Tabelle). Plus CHECK-Test:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conname in ('leads_reparatur_werkstatt_quelle_check','claims_reparatur_werkstatt_quelle_check');
```
Expected: enthaelt `gutachter` und `kb`.

- [ ] **Step 5: Migration-File committen** (Dateiname == getrackte Version)

```bash
# Datei anlegen: supabase/migrations/<V>_reparaturwunsch_vermittlung.sql  (Inhalt = DDL aus Step 1)
git add supabase/migrations/<V>_reparaturwunsch_vermittlung.sql
git commit -m "feat(reparaturwunsch): DDL — reparaturwunsch + vermittlung_status + extern (leads/claims) + quelle-CHECK gutachter/kb"
```

- [ ] **Step 6: Types regenerieren**

`generate_typescript_types` → Ausgabe in `src/lib/supabase/database.types.ts` schreiben.
```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(types): regen nach reparaturwunsch/vermittlung-Spalten"
```
Falls tsc danach an bestehenden Record-Casts meckert: nicht „reparieren", die Casts bleiben absichtlich (Type-Lag-Kommentar in convert-lead-to-claim.ts). `npx tsc --noEmit` muss gruen sein.

---

## Phase 1 — Erfassung (Config, kein Formular-Code)

### Task 1.1: Die 3 `onboarding_felder`-Zeilen (Migration)

**Files:**
- Create: `supabase/migrations/<V>_reparaturwunsch_config_felder.sql`

**Interfaces:**
- Produces: Config-Felder `reparaturwunsch` (toggle-cards), `reparatur_vermittlung_status` (segmented, conditional), `reparatur_werkstatt_extern` (text, conditional) — sichtbar in Flow-Feststellung + Dispatcher-Formular; auto-allowlisted (Reader ist config-derived).

- [ ] **Step 1: Bestehende Struktur inspizieren** (READ, um NOT-NULL-Spalten + phase_id korrekt zu treffen)

`execute_sql`:
```sql
-- passende Phase (sektion 'schaden') + eine Beispielzeile fuer alle Pflicht-Spalten
select p.id as phase_id, p.phase_key, p.flow_key
from public.onboarding_phasen p where p.flow_key='lead-erfassung' order by p.reihenfolge;

select feld_key, phase_id, reihenfolge, typ, label, hint, placeholder, pflicht,
       optionen, validation, db_target, conditional_on, audience, sektion
from public.onboarding_felder f
join public.onboarding_phasen p on p.id=f.phase_id
where p.flow_key='lead-erfassung' and f.audience in ('beide','dispatcher','kunde')
order by f.reihenfolge limit 3;
```
Notiere: die `phase_id` fuer die Sektion, in der die Felder sitzen sollen; `max(reihenfolge)` in der Ziel-Sektion (fuer die Einordnung); ob `sektion` an der Phase oder am Feld haengt.

- [ ] **Step 2: Idempotenten Seed formulieren** (Werte aus Step 1 einsetzen — `<PHASE_ID>`, `<R1..R3>` = passende reihenfolge)

```sql
insert into public.onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target, conditional_on, audience, sektion)
values
  ('<PHASE_ID>', <R1>, 'reparaturwunsch', 'toggle-cards',
   'Wie möchtest du den Schaden abrechnen?', 'Reparatur oder Auszahlung — für dein Gutachten wichtig.', false,
   '[{"label":"Reparatur (in der Werkstatt)","value":"reparatur"},{"label":"Fiktiv (Auszahlung, keine Reparatur)","value":"fiktiv"},{"label":"Noch unentschieden","value":"unentschieden"}]'::jsonb,
   '{"tabelle":"leads","spalte":"reparaturwunsch"}'::jsonb, null, 'beide', 'schaden'),
  ('<PHASE_ID>', <R2>, 'reparatur_vermittlung_status', 'segmented',
   'Hast du schon eine Werkstatt?', null, false,
   '[{"label":"Ja, ich habe eine Werkstatt","value":"eigene"},{"label":"Nein, bitte vermittelt mir eine","value":"offen"}]'::jsonb,
   '{"tabelle":"leads","spalte":"reparatur_vermittlung_status"}'::jsonb,
   '{"feld":"reparaturwunsch","equals":"reparatur"}'::jsonb, 'beide', 'schaden'),
  ('<PHASE_ID>', <R3>, 'reparatur_werkstatt_extern', 'text',
   'Name deiner Werkstatt', 'Optional — falls du schon eine Werkstatt hast.', false,
   null,
   '{"tabelle":"leads","spalte":"reparatur_werkstatt_extern"}'::jsonb,
   '{"feld":"reparatur_vermittlung_status","equals":"eigene"}'::jsonb, 'beide', 'schaden')
on conflict (feld_key) do nothing;
```
> Falls `onboarding_felder` keinen UNIQUE auf `feld_key` hat, `on conflict` weglassen und stattdessen ein vorangestelltes `delete ... where feld_key in (...)` fuer Idempotenz nutzen (in Step 1 pruefen: `select indexdef from pg_indexes where tablename='onboarding_felder';`).

- [ ] **Step 3: Anwenden + tracken + committen** — wie Task 0.1 Steps 2-5 (`apply_migration({name:"reparaturwunsch_config_felder"})` → `list_migrations` → File `<V>_reparaturwunsch_config_felder.sql` committen).

- [ ] **Step 4: Verifizieren (READ)**

```sql
select f.feld_key, f.typ, f.audience, f.db_target, f.conditional_on
from public.onboarding_felder f join public.onboarding_phasen p on p.id=f.phase_id
where p.flow_key='lead-erfassung' and f.feld_key in
  ('reparaturwunsch','reparatur_vermittlung_status','reparatur_werkstatt_extern');
```
Expected: 3 Zeilen mit korrekten `db_target`/`conditional_on`.

- [ ] **Step 5: Allowlist-Derivation bestaetigen** (kein Code noetig, nur Beweis)

Lies `src/lib/onboarding/lead-erfassung-allowlist.ts` erneut und bestaetige: `ladeLeadErfassungLeadsFelder` nimmt alle Felder mit `db_target.tabelle==='leads'` auf → unsere 3 Felder sind automatisch schreibbar via `saveDispatchLeadFelder` + `speichereFeststellungFlow`. Kein weiterer Code. (Falls es doch eine statische Zusatz-Allowlist gaebe: dort ergaenzen — es gibt keine, verifiziert.)

### Task 1.2: `reparaturwunsch`/`status` post-conversion editierbar (Fallakte)

**Files:**
- Modify: `src/app/faelle/[id]/_actions/stammdaten.ts` (`FALL_EDITABLE_FIELDS`)

- [ ] **Step 1:** In `FALL_EDITABLE_FIELDS` (Muster: dort steht `werkstatt_seit_datum`) ergaenzen: `'reparaturwunsch'`, `'reparatur_vermittlung_status'`, `'reparatur_werkstatt_extern'`. Zuerst `grep -n "werkstatt_seit_datum" src/app/faelle/[id]/_actions/stammdaten.ts` fuer die exakte Stelle/Struktur (Array vs. Set vs. Objekt).

- [ ] **Step 2:** `npx tsc --noEmit` gruen.

- [ ] **Step 3: Commit**
```bash
git add src/app/faelle/[id]/_actions/stammdaten.ts
git commit -m "feat(reparaturwunsch): Config-Felder (Flow+Dispatcher) + Fallakte-Editierbarkeit"
```

---

## Phase 2 — Carry-over Lead → Claim

### Task 2.1: 3 Felder in `claimsInsert`

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts` (nach Zeile 458)
- Test: `src/lib/leads/__tests__/convert-lead-to-claim.test.ts`

**Interfaces:**
- Consumes: `lead.reparaturwunsch`, `lead.reparatur_vermittlung_status`, `lead.reparatur_werkstatt_extern` (Lead via `select('*')`).
- Produces: dieselben 3 Spalten auf dem erzeugten Claim.

- [ ] **Step 1: Failing test** — im bestehenden Test-File einen Case ergaenzen (finde ein bestehendes „carry-over"-Test-Setup und spiegle es):

```ts
it('uebernimmt reparaturwunsch + vermittlung_status + extern auf den Claim', async () => {
  const lead = makeLead({
    reparaturwunsch: 'reparatur',
    reparatur_vermittlung_status: 'eigene',
    reparatur_werkstatt_extern: 'Karrosserie Müller',
  })
  const { claimsInsert } = await runConvert(lead) // dem vorhandenen Harness entsprechend
  expect(claimsInsert.reparaturwunsch).toBe('reparatur')
  expect(claimsInsert.reparatur_vermittlung_status).toBe('eigene')
  expect(claimsInsert.reparatur_werkstatt_extern).toBe('Karrosserie Müller')
})
```
> Passe `makeLead`/`runConvert` an die im File vorhandenen Test-Helfer an (zuerst die bestehenden reparatur_werkstatt_*-Tests im File lesen und exakt dieselbe Mechanik nutzen).

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run src/lib/leads/__tests__/convert-lead-to-claim.test.ts`
Expected: FAIL (Felder undefined).

- [ ] **Step 3: Implement** — nach Zeile 458 (direkt unter dem `reparatur_werkstatt_quelle`-Block) einfuegen:

```ts
  ;(claimsInsert as Record<string, unknown>).reparaturwunsch =
    (lead.reparaturwunsch as string | null) ?? null
  ;(claimsInsert as Record<string, unknown>).reparatur_vermittlung_status =
    (lead.reparatur_vermittlung_status as string | null) ?? 'offen'
  ;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_extern =
    (lead.reparatur_werkstatt_extern as string | null) ?? null
```

- [ ] **Step 4: Run → PASS**
Run: `npx vitest run src/lib/leads/__tests__/convert-lead-to-claim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/leads/convert-lead-to-claim.ts src/lib/leads/__tests__/convert-lead-to-claim.test.ts
git commit -m "feat(reparaturwunsch): carry-over reparaturwunsch/vermittlung_status/extern lead->claim"
```

---

## Phase 3 — Geteilter Vermittlungs-Kern

### Task 3.1: Gate + Patch (pure, TDD)

**Files:**
- Create: `src/lib/werkstatt/vermittlung-core.ts`
- Test: `src/lib/werkstatt/__tests__/vermittlung-core.test.ts`

**Interfaces:**
- Produces:
  - `type VermittlungQuelle = 'dispatcher'|'kunde'|'embed'|'gutachter'|'kb'`
  - `type VermittlungTarget = { target: 'lead'|'claim'; id: string }`
  - `brauchtWerkstattVermittlung(row): boolean`
  - `buildZuweisungPatch(werkstattId: string, userId: string, quelle: VermittlungQuelle): Record<string, unknown>`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { brauchtWerkstattVermittlung, buildZuweisungPatch } from '../vermittlung-core'

describe('brauchtWerkstattVermittlung', () => {
  const base = { reparaturwunsch: 'reparatur', reparatur_werkstatt_id: null, werkstatt_id: null, reparatur_vermittlung_status: 'offen' }
  it('true bei reparatur + keine Werkstatt + offen', () => {
    expect(brauchtWerkstattVermittlung(base)).toBe(true)
  })
  it('false bei fiktiv', () => {
    expect(brauchtWerkstattVermittlung({ ...base, reparaturwunsch: 'fiktiv' })).toBe(false)
  })
  it('false wenn schon reparatur_werkstatt_id gesetzt', () => {
    expect(brauchtWerkstattVermittlung({ ...base, reparatur_werkstatt_id: 'w1' })).toBe(false)
  })
  it('false wenn Inbound-werkstatt_id gesetzt (kam ueber QR)', () => {
    expect(brauchtWerkstattVermittlung({ ...base, werkstatt_id: 'inbound1' })).toBe(false)
  })
  it('false bei status eigene/abgelehnt/vermittelt', () => {
    for (const s of ['eigene', 'abgelehnt', 'vermittelt']) {
      expect(brauchtWerkstattVermittlung({ ...base, reparatur_vermittlung_status: s })).toBe(false)
    }
  })
  it('default status offen wenn null', () => {
    expect(brauchtWerkstattVermittlung({ ...base, reparatur_vermittlung_status: null })).toBe(true)
  })
})

describe('buildZuweisungPatch', () => {
  it('setzt alle 5 Felder inkl. status=vermittelt + uebergebene quelle', () => {
    const p = buildZuweisungPatch('w1', 'u1', 'gutachter')
    expect(p.reparatur_werkstatt_id).toBe('w1')
    expect(p.reparatur_werkstatt_zugewiesen_von).toBe('u1')
    expect(p.reparatur_werkstatt_quelle).toBe('gutachter')
    expect(p.reparatur_vermittlung_status).toBe('vermittelt')
    expect(typeof p.reparatur_werkstatt_zugewiesen_am).toBe('string')
  })
})
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run src/lib/werkstatt/__tests__/vermittlung-core.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement (Gate + Patch-Teil der Datei)**

```ts
// Geteilter Vermittlungs-Kern: Gate + Patch + Write/Notify + Anker-Resolver.
// Plain server-only Modul (NICHT 'use server') — darf Typen/Konstanten/sync-Fns exportieren.
// Authz liegt beim Caller (jede Surface guardet Rolle/Token VOR dem Aufruf).

export type VermittlungQuelle = 'dispatcher' | 'kunde' | 'embed' | 'gutachter' | 'kb'
export type VermittlungTarget = { target: 'lead' | 'claim'; id: string }

export type BedarfRow = {
  reparaturwunsch?: string | null
  reparatur_werkstatt_id?: string | null
  werkstatt_id?: string | null
  reparatur_vermittlung_status?: string | null
}

/** Picker sichtbar? reparatur + keine Partner-Werkstatt + kein Inbound-QR + status offen. */
export function brauchtWerkstattVermittlung(row: BedarfRow): boolean {
  return (
    row.reparaturwunsch === 'reparatur' &&
    row.reparatur_werkstatt_id == null &&
    row.werkstatt_id == null &&
    (row.reparatur_vermittlung_status ?? 'offen') === 'offen'
  )
}

/** Die 5 reparatur_werkstatt_*-/status-Felder fuer eine Zuweisung (Type-Lag -> Record). */
export function buildZuweisungPatch(
  werkstattId: string,
  userId: string,
  quelle: VermittlungQuelle,
): Record<string, unknown> {
  return {
    reparatur_werkstatt_id: werkstattId,
    reparatur_werkstatt_zugewiesen_am: new Date().toISOString(),
    reparatur_werkstatt_zugewiesen_von: userId,
    reparatur_werkstatt_quelle: quelle,
    reparatur_vermittlung_status: 'vermittelt',
  }
}
```

- [ ] **Step 4: Run → PASS**
Run: `npx vitest run src/lib/werkstatt/__tests__/vermittlung-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/werkstatt/vermittlung-core.ts src/lib/werkstatt/__tests__/vermittlung-core.test.ts
git commit -m "feat(werkstatt): vermittlung-core — Gate + parametrisierter Zuweisungs-Patch (TDD)"
```

### Task 3.2: Write+Notify-Kern + Anker-Resolver

**Files:**
- Modify: `src/lib/werkstatt/vermittlung-core.ts` (Funktionen ergaenzen)
- Modify: `src/lib/werkstatt/notify-kunde-vermittlung.ts` (optionales `imAuftrag`-Wording)

**Interfaces:**
- Consumes: `findWerkstaetten`, `notifyKundeWerkstattVermittlung`, `notifyWerkstattNeuerAuftrag`, `createMitteilung`.
- Produces:
  - `assignReparaturWerkstatt(admin, input: VermittlungTarget & { werkstattId; quelle; actorUserId }): Promise<{ ok; error? }>`
  - `findReparaturWerkstaettenForTarget(admin, input: VermittlungTarget): Promise<WerkstattFinderRow[]>` (limit 5)

- [ ] **Step 1: `notify-kunde-vermittlung.ts` um Wording erweitern** — die beiden Builder + `notifyKundeWerkstattVermittlung` bekommen ein optionales Feld `imAuftragVon?: 'gutachter'|'dispatcher'|'kb'|null`. Wording-Regel: wenn gesetzt, Einleitung „Dein Gutachter hat für dich …" / „Wir haben für dich …" statt „wir haben Dir … vermittelt". Signatur additiv (default `null` → bisheriges Wording, damit der Dispatcher-Pfad byte-gleich bleibt). Konkret in `buildKundeVermittlungWhatsApp` + `buildKundeVermittlungEmailHtml` je eine Zeilen-Variante; in `notifyKundeWerkstattVermittlung(args)` `args.imAuftragVon` durchreichen.

- [ ] **Step 2: Kern-Funktionen implementieren** (an `vermittlung-core.ts` anfuegen)

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { findWerkstaetten, type WerkstattFinderRow } from '@/lib/werkstatt/finder'

/** 5 naechste aktive Partner-Werkstaetten zum Standort-Anker eines Lead/Claim.
 *  Anker: Lead -> besichtigungsort_lat/lng, sonst unfallort_lat/lng, sonst kunde_plz/halter_plz.
 *  Claim -> schadenort_lat/lng, sonst schadenort_plz. */
export async function findReparaturWerkstaettenForTarget(
  admin: SupabaseClient,
  input: VermittlungTarget,
): Promise<WerkstattFinderRow[]> {
  let lat: number | undefined, lng: number | undefined, plz: string | undefined
  if (input.target === 'lead') {
    const { data } = await admin.from('leads')
      .select('besichtigungsort_lat, besichtigungsort_lng, unfallort_lat, unfallort_lng, kunde_plz, halter_plz')
      .eq('id', input.id).maybeSingle()
    const l = (data ?? null) as Record<string, number | string | null> | null
    if (l) {
      if (l.besichtigungsort_lat != null && l.besichtigungsort_lng != null) { lat = l.besichtigungsort_lat as number; lng = l.besichtigungsort_lng as number }
      else if (l.unfallort_lat != null && l.unfallort_lng != null) { lat = l.unfallort_lat as number; lng = l.unfallort_lng as number }
      plz = (l.kunde_plz as string | null) ?? (l.halter_plz as string | null) ?? undefined
    }
  } else {
    const { data } = await admin.from('claims')
      .select('schadenort_lat, schadenort_lng, schadenort_plz')
      .eq('id', input.id).maybeSingle()
    const c = (data ?? null) as Record<string, number | string | null> | null
    if (c) {
      if (c.schadenort_lat != null && c.schadenort_lng != null) { lat = c.schadenort_lat as number; lng = c.schadenort_lng as number }
      plz = (c.schadenort_plz as string | null) ?? undefined
    }
  }
  return findWerkstaetten({ lat, lng, plz, limit: 5 })
}

/** Write + Notify. Caller MUSS Rolle/Token/Ownership VOR dem Aufruf geprueft haben.
 *  Nutzt einen service-role Admin-Client (Reads ueber RLS hinweg + Update). Kein revalidatePath
 *  (surface-spezifisch — Caller revalidiert). */
export async function assignReparaturWerkstatt(
  admin: SupabaseClient,
  input: VermittlungTarget & { werkstattId: string; quelle: VermittlungQuelle; actorUserId: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const table = input.target === 'lead' ? 'leads' : 'claims'
  const patch = buildZuweisungPatch(input.werkstattId, input.actorUserId ?? '', input.quelle)
  const { error } = await admin.from(table).update(patch as never).eq('id', input.id)
  if (error) return { ok: false, error: error.message }

  // Non-critical: Benachrichtigungen (Kunde + Werkstatt). Ein Send-Fehler nimmt die
  // Zuweisung NICHT zurueck. Logik 1:1 aus dem bisherigen inline-Block der Dispatcher-Action.
  try {
    await notifyAfterAssign(admin, input)
  } catch (err) {
    console.warn('[assignReparaturWerkstatt] Benachrichtigung fehlgeschlagen (non-fatal):', err)
  }
  return { ok: true }
}
```

- [ ] **Step 3: `notifyAfterAssign` implementieren** — den kompletten Notify-Block aus `werkstatt-vermittlung.ts` (aktuell Zeilen 54-184: Werkstatt-Stammdaten laden, Kunde-Kontakt lead/claim, In-App-Mitteilung, `notifyKundeWerkstattVermittlung`, `notifyWerkstattNeuerAuftrag`) als private `async function notifyAfterAssign(admin, input)` in `vermittlung-core.ts` uebernehmen. Zwei Aenderungen ggue. dem Original:
  - `notifyKundeWerkstattVermittlung(..., { imAuftragVon: input.quelle === 'kunde' ? null : input.quelle })`.
  - `notifyWerkstattNeuerAuftrag`-Aufruf bleibt (Email); die In-App-Werkstatt-Mitteilung wird in Phase 6 ergaenzt (dort, weil sie `empfaenger_rolle:'werkstatt'` braucht).

- [ ] **Step 4: `npx tsc --noEmit`** gruen (Kern kompiliert, noch ohne Consumer).

- [ ] **Step 5: Commit**
```bash
git add src/lib/werkstatt/vermittlung-core.ts src/lib/werkstatt/notify-kunde-vermittlung.ts
git commit -m "feat(werkstatt): assignReparaturWerkstatt + findReparaturWerkstaettenForTarget (5) + imAuftrag-Wording"
```

### Task 3.3: Dispatcher-Action auf Kern refactoren (Boy-Scout)

**Files:**
- Modify: `src/app/dispatch/leads/[id]/_actions/werkstatt-vermittlung.ts`
- Delete: `src/app/dispatch/leads/[id]/_actions/werkstatt-vermittlung-patch.ts`
- Modify/Delete: dessen Test (falls vorhanden — `grep -rl werkstatt-vermittlung-patch src/`)

- [ ] **Step 1:** `vermittleWerkstatt` umschreiben: nach `requireRole(['dispatch','admin'])`-Guard → `const admin = createAdminClient()` → `return assignReparaturWerkstatt(admin, { target: input.target, id: input.id, werkstattId: input.werkstattId, quelle: 'dispatcher', actorUserId: user.id })` — davor/danach die `revalidatePath`-Aufrufe (lead: `/dispatch/leads/${id}` + `/dispatch/leads`; claim: `/faelle/${id}`) beibehalten. Den gesamten inline-Notify-Block loeschen (jetzt im Kern). Import `buildZuweisungPatch` entfernen; `assignReparaturWerkstatt` + `createAdminClient` importieren.

- [ ] **Step 2:** `getWerkstaettenNah` → intern auf `findReparaturWerkstaettenForTarget(createAdminClient(), input)` umstellen (ersetzt die duplizierte Anker-Logik + `limit:12`→5). Guard `requireRole(['dispatch','admin'])` bleibt.

- [ ] **Step 3:** `werkstatt-vermittlung-patch.ts` loeschen + evtl. Test. `grep -rn "werkstatt-vermittlung-patch" src/` → 0 Treffer.

- [ ] **Step 4: Build**
Run: `npm run build`
Expected: gruen (Server-Action-Change → voller Build laut AGENTS.md).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "refactor(dispatch): vermittleWerkstatt/getWerkstaettenNah auf vermittlung-core (limit 5, patch-file entfernt)"
```

---

## Phase 4 — Gutachter-Surface

### Task 4.1: Gutachter-Action

**Files:**
- Modify: `src/app/gutachter/fall/[id]/actions.ts` (`vermittleWerkstattAlsGutachter`)

**Interfaces:**
- Produces: `vermittleWerkstattAlsGutachter(input: { claimId: string; werkstattId: string }): Promise<{ ok; error? }>`

- [ ] **Step 1: Ownership-Guard-Muster ermitteln** — `grep -n "requireRole\|sv\.id\|getFallForSv\|resolveClaimId" src/app/gutachter/fall/[id]/actions.ts src/app/gutachter/fall/[id]/page.tsx` — wie stellen bestehende SV-Actions sicher, dass der SV DIESEM Fall zugewiesen ist? Dasselbe Muster verwenden.

- [ ] **Step 2: Implementieren** (im bestehenden `'use server'`-File):

```ts
export async function vermittleWerkstattAlsGutachter(
  input: { claimId: string; werkstattId: string },
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['sachverstaendiger', 'admin']) // exakte Rollen-Keys aus Step 1 uebernehmen
  if (!guard.success) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  // Ownership: dieser SV muss dem Claim zugewiesen sein (Muster aus Step 1, z.B. getFallForSv / claims.sv_id-Check).
  const { data: claim } = await supabase.from('claims').select('id').eq('id', input.claimId).maybeSingle()
  if (!claim) return { ok: false, error: 'Fall nicht gefunden oder kein Zugriff.' }

  const { assignReparaturWerkstatt } = await import('@/lib/werkstatt/vermittlung-core')
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const res = await assignReparaturWerkstatt(createAdminClient(), {
    target: 'claim', id: input.claimId, werkstattId: input.werkstattId, quelle: 'gutachter', actorUserId: user.id,
  })
  if (!res.ok) return res
  revalidatePath(`/gutachter/fall/${input.claimId}`)
  return { ok: true }
}
```
> Die RLS-`supabase`-Ownership-Query in Step 2 muss dem in Step 1 gefundenen Muster entsprechen (die reine `.select('id').eq('id')` oben ist Platzhalter fuer den echten Zuweisungs-Check — ohne ihn koennte ein fremder SV vermitteln). Falls SV-Fall-Zuordnung ueber eine View/Spalte laeuft, dort pruefen.

- [ ] **Step 3:** `npx tsc --noEmit` gruen.

- [ ] **Step 4: Commit**
```bash
git add src/app/gutachter/fall/[id]/actions.ts
git commit -m "feat(gutachter): vermittleWerkstattAlsGutachter (im Auftrag, quelle=gutachter, Ownership-Guard)"
```

### Task 4.2: Gutachter-Card + Einhaengung

**Files:**
- Create: `src/app/gutachter/fall/[id]/_components/WerkstattVermittelnCard.tsx` (`'use client'`)
- Modify: `src/app/gutachter/fall/[id]/page.tsx` (Bedarf + Werkstaetten laden, Props reichen)
- Modify: `src/app/gutachter/fall/[id]/FallDetailClient.tsx` (Card rendern)

**Interfaces:**
- Consumes: `brauchtWerkstattVermittlung`, `findReparaturWerkstaettenForTarget`, `WerkstattFinder`, `vermittleWerkstattAlsGutachter`, `WerkstattFinderRow`.

- [ ] **Step 1: Card-Komponente** — nutzt das presentation-only `WerkstattFinder`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { SectionCard } from '@/components/shared/SectionCard' // exakten Import in Step 2 verifizieren
import { toast } from 'sonner'
import { vermittleWerkstattAlsGutachter } from '../actions'

export function WerkstattVermittelnCard({ claimId, werkstaetten }: { claimId: string; werkstaetten: WerkstattFinderRow[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function onSelect(id: string) {
    setSelected(id)
    start(async () => {
      const res = await vermittleWerkstattAlsGutachter({ claimId, werkstattId: id })
      if (!res.ok) { toast.error(res.error ?? 'Vermittlung fehlgeschlagen'); return }
      toast.success('Werkstatt für den Kunden vermittelt. Er wird benachrichtigt.')
    })
  }
  return (
    <SectionCard title="Werkstatt für den Kunden vermitteln">
      <p className="text-body-sm text-claimondo-ondo mb-3">
        Der Kunde möchte reparieren und hat noch keine Werkstatt. Wähle im Auftrag des Kunden eine Partner-Werkstatt aus – er wird automatisch informiert.
      </p>
      <WerkstattFinder werkstaetten={werkstaetten} onSelect={onSelect} selectedId={selected} loading={pending} />
    </SectionCard>
  )
}
```
> Umlaute in allen sichtbaren Strings (oben korrekt). `SectionCard`/Card-Import in Step 2 gegen das im Ordner uebliche Muster verifizieren (andere `_components/*Card.tsx` anschauen).

- [ ] **Step 2: page.tsx** — Bedarf + Werkstaetten server-seitig laden. `grep -n "besichtigungsort\|resolveClaimId\|getFallForSv\|topServerBlocks" page.tsx`. Dann: den geladenen `fall` gegen `brauchtWerkstattVermittlung({ reparaturwunsch: fall.reparaturwunsch, reparatur_werkstatt_id: fall.reparatur_werkstatt_id, werkstatt_id: fall.werkstatt_id, reparatur_vermittlung_status: fall.reparatur_vermittlung_status })` pruefen; nur wenn true: `const werkstaetten = await findReparaturWerkstaettenForTarget(createAdminClient(), { target: 'claim', id: claimId })` (claimId via vorhandenem `resolveClaimId`). Beides als Props an `FallDetailClient` reichen (`werkstattVermittlung: braucht ? { claimId, werkstaetten } : null`).
  > `fall.reparaturwunsch` etc. kommen aus `v_faelle_mit_aktuellem_termin` (`select('*')`). Falls die View die neuen Spalten nach dem Types-Regen noch nicht typseitig kennt: Record-Cast wie im Repo ueblich.

- [ ] **Step 3: FallDetailClient.tsx** — neue Prop `werkstattVermittlung: { claimId: string; werkstaetten: WerkstattFinderRow[] } | null` annehmen; wenn nicht null, `<WerkstattVermittelnCard {...werkstattVermittlung} />` in der Card-Liste rendern (Nachbarschaft: bei `SvToolsCard`/`VorOrtTriggerCard`).

- [ ] **Step 4: Build**
Run: `npm run build`
Expected: gruen.

- [ ] **Step 5: Commit**
```bash
git add src/app/gutachter/fall/[id]/
git commit -m "feat(gutachter): WerkstattVermittelnCard — gegated, im Auftrag aus Partner-Pool"
```

---

## Phase 5 — KB/Admin-Surface (geteilte Fallakte)

### Task 5.1: Fallakte-Action + Picker

**Files:**
- Create: `src/app/faelle/[id]/_actions/werkstatt.ts` (`'use server'`)
- Modify: einen Fallakte-Anzeigepunkt (`_tabs/UebersichtTab.tsx` **oder** `_sidebar/QuickActions.tsx`)

**Interfaces:**
- Produces: `vermittleWerkstattFallakte(input: { claimId: string; werkstattId: string }): Promise<{ ok; error? }>`

- [ ] **Step 1: Action** (Muster wie Task 4.1, Guard `['kundenbetreuer','admin']`, quelle `'kb'`):

```ts
'use server'
import { requireRole } from '@/lib/auth/guards'
import { revalidatePath } from 'next/cache'
import { assignReparaturWerkstatt } from '@/lib/werkstatt/vermittlung-core'
import { createAdminClient } from '@/lib/supabase/admin'

export async function vermittleWerkstattFallakte(
  input: { claimId: string; werkstattId: string },
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['kundenbetreuer', 'admin'])
  if (!guard.success) return { ok: false, error: guard.error }
  const res = await assignReparaturWerkstatt(createAdminClient(), {
    target: 'claim', id: input.claimId, werkstattId: input.werkstattId, quelle: 'kb', actorUserId: guard.user.id,
  })
  if (!res.ok) return res
  revalidatePath(`/faelle/${input.claimId}`)
  return { ok: true }
}
```
Zusatz-Reader (fuer den Picker) — falls die Fallakte-Server-Component keinen Admin-Client zur Hand hat, hier auch: `export async function ladeWerkstaettenFallakte(claimId): Promise<...>` per Guard + `findReparaturWerkstaettenForTarget`. (Alternativ Werkstaetten in der Fallakte-Server-Component direkt via `findReparaturWerkstaettenForTarget` laden — bevorzugt, spart eine Action.)

- [ ] **Step 2: UI** — in der Fallakte einen gegateten Abschnitt: server-seitig `brauchtWerkstattVermittlung(claim)` (Claim-Row hat die Felder direkt); wenn true, den `WerkstattFinder` (client) mit `onSelect → vermittleWerkstattFallakte` rendern. Wiederverwendbarkeit: die Gutachter-Card ist SV-actions-gebunden → hier eine kleine analoge Client-Wrapper-Komponente (oder eine geteilte, actions-agnostische `WerkstattVermittelnPanel` mit `onVermittle`-Prop — pruefen ob Extraktion >2 Consumer rechtfertigt: Gutachter + Fallakte = 2, also grenzwertig; wenn Dispatcher-`WerkstattVermittlungPanel` strukturell passt, dieses als Vorbild nehmen).

- [ ] **Step 3: Build** → gruen.

- [ ] **Step 4: Commit**
```bash
git add src/app/faelle/[id]/
git commit -m "feat(faelle): KB/Admin Werkstatt-Vermittlung (im Auftrag, quelle=kb) in geteilter Fallakte"
```

---

## Phase 6 — Partner-Zustellung (Inbox-Slice ernten)

> **Vorbedingung pruefen:** `git show origin/staging:src/lib/mitteilungen/types.ts | grep -n "EmpfaengerRolle\|'werkstatt'"` — ist `'werkstatt'` schon in staging (via mitteilungs-Refactor / #3263)? Wenn ja, Task 6.1 entfaellt. Wenn nein, 6.1 ausfuehren.

### Task 6.1: `mitteilungen`-Rolle 'werkstatt'

**Files:** Modify `src/lib/mitteilungen/types.ts`

- [ ] **Step 1:** `grep -n "EmpfaengerRolle" src/lib/mitteilungen/types.ts`; den Union-Typ um `| 'werkstatt'` erweitern. Falls eine DB-Constraint/Enum die Rolle prueft: per `execute_sql` READ pruefen ob `mitteilungen.empfaenger_rolle` ein CHECK/enum hat, das 'werkstatt' zulaesst — falls nicht, eine kleine Plugin-Migration (CHECK erweitern) wie Phase 0.
- [ ] **Step 2:** `npx tsc --noEmit` gruen. Commit: `feat(mitteilungen): EmpfaengerRolle += 'werkstatt'`.

### Task 6.2: RPC + Reader + Inbox-UI (Ernte, verbatim)

**Files:**
- Create: `supabase/migrations/<V>_get_werkstatt_reparatur_auftraege.sql` (Migration, Inhalt unten)
- Create: `src/lib/werkstatt/reparatur-auftraege.ts`
- Create: `src/components/werkstatt/WerkstattReparaturAuftraege.tsx`
- Create: `src/app/werkstatt/(shell)/auftraege/page.tsx`

- [ ] **Step 1: RPC via Plugin** — `apply_migration({ name: "get_werkstatt_reparatur_auftraege", query: <SQL> })` mit:

```sql
CREATE OR REPLACE FUNCTION public.get_werkstatt_reparatur_auftraege()
 RETURNS TABLE(claim_id uuid, kunde_name text, fahrzeug text, kennzeichen text, ort text, quelle text, zugewiesen_am timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id AS claim_id,
    NULLIF(btrim(concat_ws(' ', l.vorname, l.nachname)), '') AS kunde_name,
    NULLIF(btrim(concat_ws(' ', l.fahrzeug_hersteller, l.fahrzeug_modell,
      CASE WHEN l.fahrzeug_baujahr IS NOT NULL THEN '(' || l.fahrzeug_baujahr || ')' END)), '') AS fahrzeug,
    l.kennzeichen, c.schadenort_ort AS ort,
    c.reparatur_werkstatt_quelle AS quelle, c.reparatur_werkstatt_zugewiesen_am AS zugewiesen_am
  FROM public.claims c LEFT JOIN public.leads l ON l.id = c.lead_id
  WHERE c.reparatur_werkstatt_id = (SELECT w.id FROM public.werkstaetten w WHERE w.user_id = auth.uid())
  ORDER BY c.reparatur_werkstatt_zugewiesen_am DESC NULLS LAST;
$function$;
REVOKE ALL ON FUNCTION public.get_werkstatt_reparatur_auftraege() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_werkstatt_reparatur_auftraege() TO authenticated;
```
`list_migrations` → File `<V>_get_werkstatt_reparatur_auftraege.sql` committen.

- [ ] **Step 2: Reader** — `src/lib/werkstatt/reparatur-auftraege.ts` verbatim aus der Ernte (Typ `WerkstattReparaturAuftrag` + `getWerkstattReparaturAuftraege()` via `supabase.rpc('get_werkstatt_reparatur_auftraege' as never)`).

- [ ] **Step 3: Inbox-UI** — `src/components/werkstatt/WerkstattReparaturAuftraege.tsx` verbatim aus der Ernte, **mit einer Ergaenzung**: `QUELLE_LABEL` um `gutachter: 'Gutachter'` und `kb: 'Kundenbetreuer'` erweitern (die neuen quelle-Werte dieses Features).

- [ ] **Step 4: Seite** — `src/app/werkstatt/(shell)/auftraege/page.tsx` verbatim aus der Ernte (`getWerkstattByUserId` + Reader + Komponente).

- [ ] **Step 5: RLS-Smoke** — als echte Werkstatt (JWT + `set local role authenticated`, NICHT nur GUC) `select * from get_werkstatt_reparatur_auftraege()` → nur eigene Zeilen. Ein zweiter Werkstatt-User sieht die fremden NICHT. (Memory-Lehre: RLS/DEFINER nur mit gesetzter Rolle testen.)

- [ ] **Step 6: Build + Commit**
Run: `npm run build` → gruen.
```bash
git add supabase/migrations/<V>_get_werkstatt_reparatur_auftraege.sql src/lib/werkstatt/reparatur-auftraege.ts src/components/werkstatt/WerkstattReparaturAuftraege.tsx "src/app/werkstatt/(shell)/auftraege/page.tsx"
git commit -m "feat(werkstatt): Portal-Inbox /werkstatt/auftraege (RPC self-scoped) + quelle gutachter/kb"
```

### Task 6.3: In-App-Werkstatt-Mitteilung + Nav-Eintrag

**Files:**
- Modify: `src/lib/werkstatt/vermittlung-core.ts` (`notifyAfterAssign`)
- Modify: `src/components/werkstatt/WerkstattShell.tsx` (Nav) — **⚠ Konflikt Session 2cc586af**

- [ ] **Step 1:** In `notifyAfterAssign` (Werkstatt-Zweig, direkt vor/nach dem `notifyWerkstattNeuerAuftrag`-Email-Aufruf) zusaetzlich die In-App-Mitteilung senden, wenn die Werkstatt einen `user_id` hat:
```ts
if (w?.user_id && w?.name) {
  const { createMitteilung } = await import('@/lib/mitteilungen/create-mitteilung')
  await createMitteilung({
    empfaenger_id: w.user_id, empfaenger_rolle: 'werkstatt', kategorie: 'update',
    titel: 'Neuer Reparaturauftrag', inhalt: 'Dir wurde über Claimondo ein Reparaturauftrag zugewiesen. Details im Portal unter „Reparatur-Aufträge".',
    kontext_typ: input.target === 'claim' ? 'fall' : 'lead', kontext_id: input.id,
  })
}
```
(Der `werkstaetten`-Select in `notifyAfterAssign` laedt bereits `user_id`.)

- [ ] **Step 2: Nav-Eintrag** — in `WerkstattShell.tsx` einen Link `/werkstatt/auftraege` („Reparatur-Aufträge") ergaenzen. **Erst pruefen** ob Session 2cc586af (`kitta/updates-feld-phase5-cleanup` / `WerkstattShell.tsx`) schon in staging gemergt ist (`git log origin/staging --oneline -5 -- src/components/werkstatt/WerkstattShell.tsx`); wenn ja, auf staging rebasen und minimal-additiv einfuegen. Wenn deren Arbeit noch offen ist: diesen Step als letzten machen / kurz abstimmen.

- [ ] **Step 3: Build + Commit**
Run: `npm run build` → gruen.
```bash
git add src/lib/werkstatt/vermittlung-core.ts src/components/werkstatt/WerkstattShell.tsx
git commit -m "feat(werkstatt): In-App-Auftragsmitteilung + Nav-Eintrag Reparatur-Aufträge"
```

---

## Phase 7 — Kunde-Flow-Step (ZULETZT, aar-956-Kollision)

> **Vor Phase 7 PFLICHT:** auf aktuelles `origin/staging` rebasen (`git fetch origin staging && git rebase origin/staging`) — die 3 aar-956-Sessions haben `FlowWizardKfz.tsx` bis dahin ggf. veraendert. Alle folgenden Zeilen-/Struktur-Angaben gegen die dann-aktuelle Datei verifizieren.

### Task 7.1: Flow-Actions (token-scoped)

**Files:** Modify `src/app/flow/[token]/self-service-actions.ts`

**Interfaces:**
- Produces: `ladeWerkstaettenFlow(token: string): Promise<{ ok:true; werkstaetten: WerkstattFinderRow[] } | { ok:false; error:string }>`; `waehleWerkstattFlow(token: string, werkstattId: string): Promise<{ ok; error? }>`

- [ ] **Step 1: Token→Lead-Muster ermitteln** — `grep -n "flow_links\|token\|speichereBesichtigungsortFlow" src/app/flow/[token]/self-service-actions.ts` — exakt wie `speichereBesichtigungsortFlow` Token→lead_id aufloest. Dasselbe nutzen (kein Client-`leadId`).

- [ ] **Step 2: Implementieren:**
```ts
export async function ladeWerkstaettenFlow(token: string) {
  const leadId = await resolveLeadIdFromToken(token) // exakt wie speichereBesichtigungsortFlow
  if (!leadId) return { ok: false as const, error: 'Ungültiger Link.' }
  const { findReparaturWerkstaettenForTarget } = await import('@/lib/werkstatt/vermittlung-core')
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const werkstaetten = await findReparaturWerkstaettenForTarget(createAdminClient(), { target: 'lead', id: leadId })
  return { ok: true as const, werkstaetten }
}

export async function waehleWerkstattFlow(token: string, werkstattId: string) {
  const leadId = await resolveLeadIdFromToken(token)
  if (!leadId) return { ok: false, error: 'Ungültiger Link.' }
  const { assignReparaturWerkstatt } = await import('@/lib/werkstatt/vermittlung-core')
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const res = await assignReparaturWerkstatt(createAdminClient(), {
    target: 'lead', id: leadId, werkstattId, quelle: 'kunde', actorUserId: null,
  })
  if (!res.ok) return res
  revalidatePath(`/flow/${token}`)
  return { ok: true }
}
```
> Sicherheit: `leadId` kommt AUSSCHLIESSLICH aus dem Token; `werkstattId` ist der einzige Client-Input. Kein Fremd-Lead schreibbar (verhindert Ownership-Hijack).

- [ ] **Step 3:** `npx tsc --noEmit` gruen. Commit: `feat(flow): ladeWerkstaettenFlow + waehleWerkstattFlow (token-scoped, quelle=kunde)`.

### Task 7.2: FlowWerkstattStep + STEPS-Einbindung

**Files:**
- Create: `src/app/flow/[token]/FlowWerkstattStep.tsx`
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx`

- [ ] **Step 1: Step-Komponente** (Vorbild `FlowSlotStep.tsx` — zuerst dessen Struktur lesen: Props, wie es Actions ruft, wie „weiter/ueberspringen" funktioniert):
```tsx
'use client'
import { useEffect, useState, useTransition } from 'react'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { ladeWerkstaettenFlow, waehleWerkstattFlow } from './self-service-actions'
// Button/Layout exakt wie in FlowSlotStep importieren

export function FlowWerkstattStep({ token, onDone }: { token: string; onDone: () => void }) {
  const [werkstaetten, setWerkstaetten] = useState<WerkstattFinderRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, start] = useTransition()
  useEffect(() => {
    ladeWerkstaettenFlow(token).then((r) => { if (r.ok) setWerkstaetten(r.werkstaetten); setLoading(false) })
  }, [token])
  function onSelect(id: string) {
    setSelected(id)
    start(async () => {
      const res = await waehleWerkstattFlow(token, id)
      if (res.ok) onDone()
    })
  }
  return (
    <div>
      <h2 className="text-heading-sm text-claimondo-navy">Wähle deine Werkstatt</h2>
      <p className="text-body-sm text-claimondo-ondo mb-4">Die 5 nächstgelegenen Partner-Werkstätten zu deinem Besichtigungsort. Du kannst diesen Schritt auch überspringen.</p>
      <WerkstattFinder werkstaetten={werkstaetten} onSelect={onSelect} selectedId={selected} loading={loading || pending} />
      <button type="button" onClick={onDone} className="mt-4 text-body-sm text-claimondo-ondo underline">Überspringen</button>
    </div>
  )
}
```
> Button/Skip als `primitives.Button variant="ghost"` statt handgerolltem `<button>` umsetzen (Komponenten-Set-Ratchet) — exakten Import aus FlowSlotStep uebernehmen.

- [ ] **Step 2: STEPS-Einbindung** in `FlowWizardKfz.tsx` (gegen aktuelle Struktur nach Rebase):
  - `StepId`-Union um `'werkstatt'` erweitern.
  - In BEIDE STEPS-Zweige einen conditional Eintrag **vor `'sa'`** einfuegen, sichtbar nur wenn `initialBraucht` true.
  - `initialBraucht` beim Mount fixieren — analog `initialNeedsBooking`: `const [initialBraucht] = useState(() => brauchtWerkstattVermittlung({ reparaturwunsch: lead.reparaturwunsch, reparatur_werkstatt_id: lead.reparatur_werkstatt_id, werkstatt_id: lead.werkstatt_id, reparatur_vermittlung_status: lead.reparatur_vermittlung_status }))`. (`brauchtWerkstattVermittlung` ist eine reine Fn — Import aus vermittlung-core ist im Client ok, da keine Server-only-Imports darin.)
  - Neuer Switch-Case `'werkstatt'`: `<FlowWerkstattStep token={token} onDone={goNext} />` (goNext = die im Wizard uebliche „naechster Step"-Funktion).
  > Falls `lead` im Wizard die neuen Felder nicht typseitig kennt: Record-Cast. Falls der Besichtigungsort im incomplete-Pfad erst im `termin`-Step gesetzt wird — der Step sitzt VOR `sa`, also nach `termin`; im dispatcher/embed-Pfad ist er vorbelegt. Kein extra Ort-Gate noetig (Finder faellt sonst auf PLZ zurueck).

- [ ] **Step 3: Build (voll — Route-Change)**
Run: `npm run build`
Expected: gruen.

- [ ] **Step 4: Commit**
```bash
git add src/app/flow/[token]/FlowWerkstattStep.tsx src/app/flow/[token]/FlowWizardKfz.tsx
git commit -m "feat(flow): Kunde-Werkstatt-Step (5 naechste, gegated, ueberspringbar)"
```

---

## Phase 8 — Verifikation, Ratchets, PR

### Task 8.1: Gesamt-Checks

- [ ] **Step 1:** `npm run build` gruen.
- [ ] **Step 2:** `npx vitest run src/lib/werkstatt src/lib/leads` gruen.
- [ ] **Step 3:** Ratchets: `npm run check:token-audit`, `npm run check:component-set -- --ratchet`, `npm run check:knip -- --ratchet` — je exit 0 (bei neuem toten Code Baseline via `--update-baseline` senken; bei neuem Card/Button-Verstoss aufs Primitive migrieren).
- [ ] **Step 4:** Prod-Smoke (BROADCAST-Direktive „bis 1+", RLS via JWT als echte Rolle):
  - Werkstatt-Inbox: echte Werkstatt sieht nur eigene Auftraege (0 fremde).
  - Gutachter vermittelt an einem echten Fall (reparatur, keine Werkstatt) → `reparatur_werkstatt_id`/`_quelle='gutachter'`/`status='vermittelt'` gesetzt; Kunde-Notify raus; Auftrag erscheint in Werkstatt-Inbox.
  - Flow: `reparaturwunsch`-Frage erscheint (Config), Picker-Step nur bei `reparatur`+keine Werkstatt; „Überspringen" funktioniert.
  - Gate: bei `fiktiv` / bereits gesetzter Werkstatt / Inbound-`werkstatt_id` erscheint KEIN Picker (keine Surface).

### Task 8.2: PR

- [ ] **Step 1:** `git push -u origin kitta/reparaturwunsch-werkstatt-vermittlung`.
- [ ] **Step 2:** PR gegen `staging` (nie `main`), Titel `feat: Reparaturwunsch + Werkstatt-Vermittlung Phase 2 (Kunde/Gutachter/KB)`, Body mit 7-Punkte-Audit + Verweis auf Spec + Koordinations-Hinweis (aar-956 `FlowWizardKfz`-Rebase, `WerkstattShell` 2cc586af).

---

## Self-Review (durchgefuehrt beim Schreiben)

- **Spec-Coverage:** Datenmodell (P0), Erfassung Config Flow+Dispatcher (P1), Carry-over (P2), geteilter Kern + Gate + limit 5 + Dispatcher-Refactor (P3), Gutachter im Auftrag aus Pool (P4), KB/Admin (P5), Partner-Zustellung Inbox+In-App+Email (P6), Kunde-Flow-Step (P7). Alle 16 Spec-Abschnitte abgedeckt.
- **Type-Konsistenz:** `assignReparaturWerkstatt`/`findReparaturWerkstaettenForTarget`/`brauchtWerkstattVermittlung`/`buildZuweisungPatch`/`VermittlungQuelle`/`VermittlungTarget` durchgaengig identisch benannt in P3→P4→P5→P7.
- **Offene Verifikations-Punkte (bewusst als Steps, nicht Platzhalter):** exakte quelle-CHECK-Namen (P0.1 S1), phase_id/Pflichtspalten der Config-Zeilen (P1.1 S1), SV-Ownership-Muster (P4.1 S1), Token-Resolver-Name (P7.1 S1), `EmpfaengerRolle`-Stand in staging (P6 Vorbedingung), `FALL_EDITABLE_FIELDS`-Struktur (P1.2 S1) — jeweils per gezieltem grep/READ VOR dem Edit.
