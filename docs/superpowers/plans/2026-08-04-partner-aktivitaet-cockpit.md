# Partner-Aktivitäts-Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein generisches Partner-Cockpit (Aktivitäts-Feed + Aktions-Leiste) in allen 4 Partner-Detail-Views (SV/Makler/Werkstatt/Flotte), gespeist aus einer polymorphen `partner_aktivitaeten`-Tabelle (manuelle CRM-Einträge + automatische System-Events).

**Architecture:** Eine polymorphe DB-Tabelle (`partner_typ`+`partner_id`) als Single-Source. Ein Client-Composite `PartnerCockpitPanel` lädt die Chronik über eine staff-gated Server-Action und rendert `PartnerActionBar` + `PartnerAktivitaetsFeed` + `PartnerAktivitaetModal`. Manuelle Einträge schreiben über `logManuelleAktivitaet` (authenticated, RLS `is_staff()`); System-Events über den fire-and-forget-Helper `logPartnerEvent` (service-role), der in bestehende operative Actions additiv eingehängt wird. Farb-/Label-Mapping der Typen läuft über eine neue Status-Registry-Domain (`partner-aktivitaet`), nicht inline.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres + RLS, Migration via Supabase-MCP-Plugin), React (Client Components), Tailwind v4 mit Design-Tokens, `@/components/primitives` (Button/Card), `@/components/ui/dialog` (shadcn), vitest (pure Unit-Tests), Playwright (Prod-Smoke).

## Global Constraints

- **Regel 1:** Kein Direct-Push auf `main`. Arbeit auf `kitta/partner-aktivitaet-cockpit-spec` (bereits angelegt, off `origin/staging`), PR gegen **staging**.
- **Regel 2:** DDL **ausschließlich** über `mcp__plugin_supabase_supabase__apply_migration` (nie CLI, nie raw `execute_sql` mit DDL). `execute_sql` nur READ. Nach Migration: `list_migrations` → getrackte Version `<V>` ablesen → File exakt als `supabase/migrations/<V>_<name>.sql` committen (Twin-Drift-Regel). Types regenerieren + committen.
- **Regel 3:** Kein unbegleiteter Stash am Session-Ende.
- **Regel 4:** Nach Prod-Deploy vollständiger Playwright-Smoke gegen `https://app.claimondo.de`. Test-Konten (`telefon = NULL`), niemals echte Kundendaten mutieren.
- **Prod-Supabase-Ref:** `paizkjajbuxxksdoycev` (echtes Prod — Preview-Refs sind verwechselbar).
- **Umlaute:** ALLE nutzersichtbaren Strings (JSX-Literale, Toasts, Labels, Placeholder) mit echten `ä/ö/ü/ß`. Backend/Commits/Kommentare/`docs/` dürfen ASCII sein.
- **Server-Actions:** Result-Object `{ ok, error? }` (kein `throw`), `revalidatePath` bei jedem Write. **Keine** `const`/`type`-Exports aus `'use server'`-Files (AAR-664) → Types/Konstanten in Nicht-`'use server'`-Module.
- **Komponenten-Set:** Buttons/Cards aus `@/components/primitives`; Rich-Dialog aus `@/components/ui/dialog` (erlaubt). Kein handgerolltes `<button>`/`<div class="…rounded…border…">`.
- **Status-Registry:** Typ→Farbe **nur** über die Registry (`statusBadgeView`), nie inline `const X_COLORS`/`status === 'x' ? 'bg-…'`.
- **Branding:** `bg-claimondo-*`/`text-claimondo-*`/Status-Tokens (`bg-success-soft` etc.); kein Inline-Hex.
- **RLS-Policy-Gate:** jede `CREATE POLICY` mit explizitem `TO authenticated` (nie `TO public`, nie weglassen).
- **Anon-Grant-Gate:** `anon` bekommt **keinen** Grant auf `partner_aktivitaeten` (Spalte `text`/Muster `notiz` = sensibel → staff-only).
- **CI-Gates die grün bleiben müssen:** `check:component-set`, `check:status-registry`, `check:knip`, `check:vitest`, `check:token-audit`, `check:flag-drift`, `check:rls-policies`, `check:anon-sensitive-grants`, `check:query-drift`, voller `npm run build`.
- **Kollisions-Warnung:** die Detail-View-Files (`sachverstaendige/[id]/…`, `firmen-flotte/[id]/…`, `drawer/PartnerCockpit.tsx`) werden von anderen Lanes angefasst → **additiv** einhängen, vor dem Commit rebasen.

**Scope dieses Plans (Kern):** Tabelle + Domain + Types + Staff-Helper + Event-Helper + Config + 2 Server-Actions + 4 Komponenten + Mount in die 4 `[id]`-Seiten + Drawer-compact + **4 hochwertige System-Events** (freigeschaltet/gesperrt/verifiziert×2). **Explizit NICHT in diesem Plan** (dokumentierte Folge-Schritte, eigene PRs, Spec §7/§8/§9): F2 Route-Konsolidierung · F4 GMaps-Fix · die inkrementellen System-Events `lead_zugewiesen`/`provision`/`vertrag`/`statuswechsel` (je ein 1-Zeilen-`logPartnerEvent`-Aufruf, sobald die Ziel-Action geerdet ist).

---

### Task 1: DB-Migration `partner_aktivitaeten` (Tabelle + Index + RLS + Grants + Backfill)

**Files:**
- Create: `supabase/migrations/<V>_partner_aktivitaeten.sql` (Dateiname == getrackte Version aus `list_migrations`)
- Modify: `src/lib/supabase/database.types.ts` (Type-Regen)
- Modify: `scripts/lib/status-check-constraints.json` (Flag-Drift-Snapshot — enthält die neuen `partner_aktivitaeten`-CHECKs)

**Interfaces:**
- Produces: Tabelle `public.partner_aktivitaeten` mit Spalten `id uuid pk`, `partner_typ text`, `partner_id uuid`, `typ text`, `text text`, `meta jsonb`, `ist_system boolean`, `erstellt_von uuid`, `erstellt_am timestamptz`; RLS-Policy `partner_aktivitaeten_staff_all`; Grant `SELECT,INSERT,UPDATE,DELETE` an `authenticated` (kein `anon`).

- [ ] **Step 1: DDL schreiben** (als Payload für `apply_migration`, noch nicht ausführen)

```sql
-- partner_aktivitaeten: polymorpher Aktivitaets-/Event-Feed fuer alle Partner-Typen
-- (SV/Makler/Werkstatt/Flotte). Single-Source des Partner-Cockpits. Polymorph
-- (partner_typ + partner_id) statt 4 FK-Spalten -> passt zur generischen Komponente;
-- Integritaet per App-Write + RLS (kein DB-FK auf die Partner-Tabelle, bewusster Trade-off).
create table public.partner_aktivitaeten (
  id           uuid primary key default gen_random_uuid(),
  partner_typ  text not null check (partner_typ in ('sv','makler','werkstatt','flotte')),
  partner_id   uuid not null,
  typ          text not null check (typ in (
                 'anruf','notiz','email','einstufung','sonstiges',
                 'freigeschaltet','gesperrt','verifiziert','vertrag',
                 'lead_zugewiesen','provision','statuswechsel')),
  text         text not null,
  meta         jsonb,
  ist_system   boolean not null default false,
  erstellt_von uuid references public.profiles(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);

create index partner_aktivitaeten_partner_idx
  on public.partner_aktivitaeten (partner_typ, partner_id, erstellt_am desc);

alter table public.partner_aktivitaeten enable row level security;

-- Staff-Gate: admin/dispatch/leadbearbeiter — IDENTISCH zum erprobten
-- partner_lead_akt_staff_all. Bewusst NICHT is_staff() (= admin/kundenbetreuer/dispatch):
-- das enthaelt kundenbetreuer statt leadbearbeiter -> waere ein Mismatch zur Action-Gate
-- requireVertriebStaff (admin/dispatch/leadbearbeiter). Explizites TO authenticated
-- (RLS-Policy-Gate). Kein anon-Grant (Anon-Grant-Gate: 'text'/notiz-Muster = sensibel).
create policy partner_aktivitaeten_staff_all
  on public.partner_aktivitaeten
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.rolle = any (array['admin'::user_role, 'dispatch'::user_role, 'leadbearbeiter'::user_role]))
  )
  with check (
    exists (select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.rolle = any (array['admin'::user_role, 'dispatch'::user_role, 'leadbearbeiter'::user_role]))
  );

grant select, insert, update, delete on public.partner_aktivitaeten to authenticated;

-- Einmal-Backfill: werkstatt_notizen (einzige Multi-Entry-Notiz-Tabelle) -> partner_aktivitaeten.
-- Spalten verifiziert (prod 2026-08-04): werkstatt_id, autor_user_id, autor_name, text, created_at.
insert into public.partner_aktivitaeten
  (partner_typ, partner_id, typ, text, meta, ist_system, erstellt_von, erstellt_am)
select
  'werkstatt', wn.werkstatt_id, 'notiz', wn.text,
  case when wn.autor_name is not null then jsonb_build_object('autor_name', wn.autor_name) else null end,
  false,
  -- gehaertet: orphan autor_user_id (nicht in profiles) -> null (FK on erstellt_von)
  case when wn.autor_user_id is not null
         and exists (select 1 from public.profiles p2 where p2.id = wn.autor_user_id)
       then wn.autor_user_id else null end,
  wn.created_at
from public.werkstatt_notizen wn
where wn.text is not null and btrim(wn.text) <> '' and wn.werkstatt_id is not null;

comment on table public.werkstatt_notizen is
  'DEPRECATED (2026-08-04): nach partner_aktivitaeten migriert. Nicht droppen (Bestandsanzeige), keine neuen Writes.';
```

- [ ] **Step 2: Migration anwenden**

Tool: `mcp__plugin_supabase_supabase__apply_migration` mit `{ name: "partner_aktivitaeten", query: "<DDL aus Step 1>" }` gegen `project_id: paizkjajbuxxksdoycev`.
Expected: Erfolg (Tabelle angelegt + Backfill eingefügt).

- [ ] **Step 3: Getrackte Version ablesen + Migration-File committen**

Tool: `mcp__plugin_supabase_supabase__list_migrations` → die neueste Version `<V>` ablesen (Plugin vergibt einen EIGENEN Timestamp).
Dann das DDL aus Step 1 als `supabase/migrations/<V>_partner_aktivitaeten.sql` speichern (Dateiname exakt == `<V>`, Twin-Drift-Regel).

- [ ] **Step 4: Verifizieren (READ)**

Tool: `mcp__plugin_supabase_supabase__execute_sql` (READ) gegen `paizkjajbuxxksdoycev`:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='partner_aktivitaeten') as tabelle_da,
  (select count(*) from partner_aktivitaeten) as zeilen_nach_backfill,
  (select count(*) from werkstatt_notizen where text is not null and btrim(text) <> '') as werkstatt_notizen_quelle,
  (select has_table_privilege('anon','public.partner_aktivitaeten','SELECT')) as anon_kann_lesen;
```

Expected: `tabelle_da=1`, `zeilen_nach_backfill == werkstatt_notizen_quelle`, `anon_kann_lesen=false`.

- [ ] **Step 5: TypeScript-Types regenerieren + committen**

Run (reine LESE-Generierung, fällt NICHT unter das CLI-DDL-Verbot):
```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
```
Expected: `database.types.ts` enthält jetzt `partner_aktivitaeten` in `Database['public']['Tables']`.

- [ ] **Step 6: Flag-Drift-Snapshot regenerieren**

Run:
```bash
node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs
```
Expected: `scripts/lib/status-check-constraints.json` enthält die neuen CHECKs `partner_aktivitaeten_partner_typ_check` + `partner_aktivitaeten_typ_check`. Danach `npm run check:flag-drift` grün.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/lib/supabase/database.types.ts scripts/lib/status-check-constraints.json
git commit -m "feat(partner-cockpit): partner_aktivitaeten Tabelle + RLS + werkstatt_notizen backfill"
```

---

### Task 2: Shared-Types `aktivitaet-types.ts`

**Files:**
- Create: `src/lib/partner/aktivitaet-types.ts`
- Test: `src/lib/partner/aktivitaet-types.test.ts`

**Interfaces:**
- Produces:
  - `type PartnerTyp = 'sv' | 'makler' | 'werkstatt' | 'flotte'`
  - `const PARTNER_AKTIVITAET_TYPEN` (readonly string[]) + `type PartnerAktivitaetTyp`
  - `const PARTNER_AKTIVITAET_MANUELL: readonly ['anruf','notiz','email','einstufung','sonstiges']`
  - `type PartnerAktivitaetRow = { id; partner_typ; partner_id; typ; text; meta; ist_system; erstellt_von; erstellt_am }`
- Consumes: nichts. **In `src/lib/` (nicht unter `app/`)** — Domain/Helper/Actions/Komponenten importieren von hier ohne `lib→app`-Abhängigkeit.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/partner/aktivitaet-types.test.ts
import { describe, it, expect } from 'vitest'
import { PARTNER_AKTIVITAET_TYPEN, PARTNER_AKTIVITAET_MANUELL } from './aktivitaet-types'

describe('aktivitaet-types', () => {
  it('lists all 12 activity types incl. system events', () => {
    expect(PARTNER_AKTIVITAET_TYPEN).toContain('notiz')
    expect(PARTNER_AKTIVITAET_TYPEN).toContain('freigeschaltet')
    expect(PARTNER_AKTIVITAET_TYPEN).toContain('statuswechsel')
    expect(PARTNER_AKTIVITAET_TYPEN.length).toBe(12)
  })
  it('manual types are a strict subset (no system events)', () => {
    for (const t of PARTNER_AKTIVITAET_MANUELL) {
      expect(PARTNER_AKTIVITAET_TYPEN).toContain(t)
    }
    expect(PARTNER_AKTIVITAET_MANUELL).not.toContain('freigeschaltet')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/partner/aktivitaet-types.test.ts`
Expected: FAIL — "Cannot find module './aktivitaet-types'".

- [ ] **Step 3: Write the module**

```typescript
// src/lib/partner/aktivitaet-types.ts
// Polymorphe Partner-Aktivitaet (Cockpit): Types + Typ-Mengen. In lib/ (kein lib->app),
// damit Domain/Helper/Actions/Komponenten sie teilen. Muss mit den DB-CHECKs in
// supabase/migrations/<V>_partner_aktivitaeten.sql uebereinstimmen.

export type PartnerTyp = 'sv' | 'makler' | 'werkstatt' | 'flotte'

export const PARTNER_AKTIVITAET_TYPEN = [
  'anruf', 'notiz', 'email', 'einstufung', 'sonstiges',
  'freigeschaltet', 'gesperrt', 'verifiziert', 'vertrag',
  'lead_zugewiesen', 'provision', 'statuswechsel',
] as const
export type PartnerAktivitaetTyp = (typeof PARTNER_AKTIVITAET_TYPEN)[number]

// Typen, die Nutzer manuell protokollieren duerfen (System-Events entstehen nur via logPartnerEvent).
export const PARTNER_AKTIVITAET_MANUELL = ['anruf', 'notiz', 'email', 'einstufung', 'sonstiges'] as const
export type PartnerAktivitaetManuellTyp = (typeof PARTNER_AKTIVITAET_MANUELL)[number]

export type PartnerAktivitaetRow = {
  id: string
  partner_typ: PartnerTyp
  partner_id: string
  typ: PartnerAktivitaetTyp
  text: string
  meta: Record<string, unknown> | null
  ist_system: boolean
  erstellt_von: string | null
  erstellt_am: string
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/partner/aktivitaet-types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/partner/aktivitaet-types.ts src/lib/partner/aktivitaet-types.test.ts
git commit -m "feat(partner-cockpit): shared aktivitaet-types (PartnerTyp, typ-Mengen, Row)"
```

---

### Task 3: Status-Registry-Domain `partner-aktivitaet`

**Files:**
- Create: `src/lib/status/domains/partner-aktivitaet.ts`
- Modify: `src/lib/status/types.ts:13` (DomainName-Union)
- Modify: `src/lib/status/registry.ts` (Import + DOMAINS-Eintrag)
- Test: `src/lib/status/domains/partner-aktivitaet.test.ts`

**Interfaces:**
- Consumes: `StatusDef` aus `../types`; `PARTNER_AKTIVITAET_TYPEN` aus `@/lib/partner/aktivitaet-types` (Task 2).
- Produces: `PARTNER_AKTIVITAET_DEFS` (Record<typ, StatusDef>); Domain `'partner-aktivitaet'` in der Registry → `statusBadgeView('partner-aktivitaet', typ)` liefert `{ label, slotClass }`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/status/domains/partner-aktivitaet.test.ts
import { describe, it, expect } from 'vitest'
import { statusBadgeView } from '../resolve'
import { PARTNER_AKTIVITAET_DEFS } from './partner-aktivitaet'
import { PARTNER_AKTIVITAET_TYPEN } from '@/lib/partner/aktivitaet-types'

describe('partner-aktivitaet domain', () => {
  it('has a def for every activity typ (registry parity)', () => {
    for (const typ of PARTNER_AKTIVITAET_TYPEN) {
      expect(PARTNER_AKTIVITAET_DEFS[typ], `missing def: ${typ}`).toBeDefined()
    }
  })
  it('resolves label + slotClass via the registry', () => {
    const v = statusBadgeView('partner-aktivitaet', 'freigeschaltet')
    expect(v.label).toBe('Freigeschaltet')
    expect(v.slotClass).toBe('bg-success-soft text-success-strong')
  })
  it('maps danger for gesperrt and neutral for notiz', () => {
    expect(statusBadgeView('partner-aktivitaet', 'gesperrt').slotClass).toBe('bg-danger-soft text-danger-strong')
    expect(statusBadgeView('partner-aktivitaet', 'notiz').slotClass).toBe('bg-claimondo-bg text-claimondo-ondo')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/status/domains/partner-aktivitaet.test.ts`
Expected: FAIL — "Cannot find module './partner-aktivitaet'".

- [ ] **Step 3: Write the domain file**

```typescript
// src/lib/status/domains/partner-aktivitaet.ts
// Registry-Domain fuer den Partner-Aktivitaets-Feed (Cockpit). Label + Farb-Slot je typ.
// Die 12 Keys spiegeln PARTNER_AKTIVITAET_TYPEN (Paritaet per Test abgesichert).
import type { StatusDef } from '../types'

export const PARTNER_AKTIVITAET_DEFS = {
  anruf:           { label: 'Anruf', slot: 'active' },
  notiz:           { label: 'Notiz', slot: 'neutral' },
  email:           { label: 'E-Mail', slot: 'active' },
  einstufung:      { label: 'Einstufung', slot: 'active' },
  sonstiges:       { label: 'Sonstiges', slot: 'neutral' },
  freigeschaltet:  { label: 'Freigeschaltet', slot: 'success' },
  gesperrt:        { label: 'Gesperrt', slot: 'danger' },
  verifiziert:     { label: 'Verifiziert', slot: 'success' },
  vertrag:         { label: 'Vertrag', slot: 'success' },
  lead_zugewiesen: { label: 'Lead zugewiesen', slot: 'active' },
  provision:       { label: 'Provision', slot: 'success' },
  statuswechsel:   { label: 'Statuswechsel', slot: 'neutral' },
} satisfies Record<string, StatusDef>
```

- [ ] **Step 4: Wire the domain into the union**

In `src/lib/status/types.ts` Zeile 13 die `DomainName`-Union um `| 'partner-aktivitaet'` erweitern:

```typescript
export type DomainName = 'fall-status' | 'fall-phase' | 'claim-main-phase' | 'claims-status' | 'lead-workflow' | 'vertrieb-workflow' | 'cold-mail' | 'partner-aktivitaet'
```

- [ ] **Step 5: Wire the domain into the registry**

In `src/lib/status/registry.ts`: nach den bestehenden Domain-Imports ergänzen:

```typescript
import { PARTNER_AKTIVITAET_DEFS } from './domains/partner-aktivitaet'
```

und im `DOMAINS`-Objekt (nach `'cold-mail': COLD_MAIL_DEFS,`) ergänzen:

```typescript
  'partner-aktivitaet': PARTNER_AKTIVITAET_DEFS,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/status/domains/partner-aktivitaet.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/status/domains/partner-aktivitaet.ts src/lib/status/domains/partner-aktivitaet.test.ts src/lib/status/types.ts src/lib/status/registry.ts
git commit -m "feat(partner-cockpit): status-registry domain partner-aktivitaet (typ->label/slot)"
```

---

### Task 4: Shared-Staff-Gate `require-vertrieb-staff.ts`

**Files:**
- Create: `src/lib/auth/require-vertrieb-staff.ts`
- Test: `src/lib/auth/require-vertrieb-staff.test.ts`

**Interfaces:**
- Produces:
  - `function istVertriebRolle(rolle: string | null | undefined): boolean` (pure)
  - `async function requireVertriebStaff(): Promise<{ id: string } | null>`
- Consumes: `createClient` aus `@/lib/supabase/server`.
- Hinweis: die bestehende **lokale** `requireVertriebStaff` in `src/app/admin/partner-leads/actions.ts:81` bleibt unangetastet (Hot-File anderer Lanes; Boy-Scout-Migration später). Neuer Code importiert **diesen** Shared-Helper — keine neue Duplikation.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/auth/require-vertrieb-staff.test.ts
import { describe, it, expect } from 'vitest'
import { istVertriebRolle } from './require-vertrieb-staff'

describe('istVertriebRolle', () => {
  it('accepts staff roles', () => {
    expect(istVertriebRolle('admin')).toBe(true)
    expect(istVertriebRolle('dispatch')).toBe(true)
    expect(istVertriebRolle('leadbearbeiter')).toBe(true)
  })
  it('rejects non-staff / empty / null', () => {
    expect(istVertriebRolle('sv')).toBe(false)
    expect(istVertriebRolle('kunde')).toBe(false)
    expect(istVertriebRolle('')).toBe(false)
    expect(istVertriebRolle(null)).toBe(false)
    expect(istVertriebRolle(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/require-vertrieb-staff.test.ts`
Expected: FAIL — "Cannot find module './require-vertrieb-staff'".

- [ ] **Step 3: Write the module**

```typescript
// src/lib/auth/require-vertrieb-staff.ts
// Auth-Guard fuer Vertriebs-/Staff-Aktionen (admin/dispatch/leadbearbeiter).
// Spiegelt das Verhalten der lokalen requireVertriebStaff in partner-leads/actions.ts,
// als teilbarer Helper fuer neuen Code (Partner-Cockpit). String-Vergleich statt Enum,
// weil der TS-UserRolle-Typ der DB (leadbearbeiter) nachlaeuft.
import { createClient } from '@/lib/supabase/server'

export const VERTRIEB_ROLLEN = ['admin', 'dispatch', 'leadbearbeiter'] as const

export function istVertriebRolle(rolle: string | null | undefined): boolean {
  return VERTRIEB_ROLLEN.includes((rolle ?? '') as (typeof VERTRIEB_ROLLEN)[number])
}

export async function requireVertriebStaff(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  return istVertriebRolle(p?.rolle as string | undefined) ? { id: user.id } : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/require-vertrieb-staff.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/require-vertrieb-staff.ts src/lib/auth/require-vertrieb-staff.test.ts
git commit -m "feat(partner-cockpit): shared requireVertriebStaff + istVertriebRolle helper"
```

---

### Task 5: System-Event-Helper `log-partner-event.ts`

**Files:**
- Create: `src/lib/partner/log-partner-event.ts`
- Test: `src/lib/partner/log-partner-event.test.ts`

**Interfaces:**
- Consumes: `createAdminClient` aus `@/lib/supabase/admin`; Types aus `./aktivitaet-types` (Task 2).
- Produces:
  - `type LogPartnerEventInput = { partnerTyp: PartnerTyp; partnerId: string; typ: PartnerAktivitaetTyp; text: string; meta?: Record<string, unknown> | null }`
  - `function buildPartnerEventRow(input: LogPartnerEventInput)` (pure) → Insert-Row `{ partner_typ, partner_id, typ, text, meta, ist_system: true, erstellt_von: null }`
  - `async function logPartnerEvent(input: LogPartnerEventInput): Promise<void>` (fire-and-forget, service-role, try/catch — wirft nie)

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/partner/log-partner-event.test.ts
import { describe, it, expect } from 'vitest'
import { buildPartnerEventRow } from './log-partner-event'

describe('buildPartnerEventRow', () => {
  it('marks the row as a system event with no author', () => {
    const row = buildPartnerEventRow({
      partnerTyp: 'sv', partnerId: 'sv-1', typ: 'freigeschaltet', text: 'SV freigeschaltet',
    })
    expect(row).toEqual({
      partner_typ: 'sv', partner_id: 'sv-1', typ: 'freigeschaltet',
      text: 'SV freigeschaltet', meta: null, ist_system: true, erstellt_von: null,
    })
  })
  it('passes through meta when provided', () => {
    const row = buildPartnerEventRow({
      partnerTyp: 'werkstatt', partnerId: 'w-1', typ: 'verifiziert', text: 'ok', meta: { by: 'admin' },
    })
    expect(row.meta).toEqual({ by: 'admin' })
    expect(row.ist_system).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/partner/log-partner-event.test.ts`
Expected: FAIL — "Cannot find module './log-partner-event'".

- [ ] **Step 3: Write the module**

```typescript
// src/lib/partner/log-partner-event.ts
// System-Event-Writer fuer den Partner-Cockpit-Feed. service-role (createAdminClient),
// ist_system=true, erstellt_von=null. FIRE-AND-FORGET: ein Fehler bricht NIE den Haupt-Write
// der aufrufenden operativen Action (AGENTS §Server-Actions — Non-critical Sub-Operation).
import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnerTyp, PartnerAktivitaetTyp } from './aktivitaet-types'

export type LogPartnerEventInput = {
  partnerTyp: PartnerTyp
  partnerId: string
  typ: PartnerAktivitaetTyp
  text: string
  meta?: Record<string, unknown> | null
}

export function buildPartnerEventRow(input: LogPartnerEventInput) {
  return {
    partner_typ: input.partnerTyp,
    partner_id: input.partnerId,
    typ: input.typ,
    text: input.text,
    meta: input.meta ?? null,
    ist_system: true,
    erstellt_von: null,
  }
}

export async function logPartnerEvent(input: LogPartnerEventInput): Promise<void> {
  try {
    const db = createAdminClient()
    const { error } = await db.from('partner_aktivitaeten').insert(buildPartnerEventRow(input))
    if (error) console.error('[logPartnerEvent] insert failed (non-fatal):', error.message)
  } catch (err) {
    console.error('[logPartnerEvent] threw (non-fatal):', err)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/partner/log-partner-event.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/partner/log-partner-event.ts src/lib/partner/log-partner-event.test.ts
git commit -m "feat(partner-cockpit): logPartnerEvent fire-and-forget system-event writer"
```

---

### Task 6: Aktions-Config `partner-actions.ts`

**Files:**
- Create: `src/components/shared/partner/partner-actions.ts`
- Test: `src/components/shared/partner/partner-actions.test.ts`

**Interfaces:**
- Consumes: `PartnerTyp` aus `@/lib/partner/aktivitaet-types`.
- Produces:
  - `type PartnerActionKey = 'notiz'|'anruf'|'email'|'einstufung'|'verifizieren'|'freischalten'|'sperren'|'deeplinks'`
  - `const PARTNER_ACTIONS: Record<PartnerTyp, PartnerActionKey[]>`
  - `function aktionenFuer(partnerTyp: PartnerTyp): PartnerActionKey[]`
  - `const AKTION_LABEL: Record<PartnerActionKey, string>`
  - `const CRM_ACTIONS: readonly ['notiz','anruf','email','einstufung']` (die modal-gestützten Keys)

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/shared/partner/partner-actions.test.ts
import { describe, it, expect } from 'vitest'
import { aktionenFuer, PARTNER_ACTIONS, AKTION_LABEL } from './partner-actions'

describe('PARTNER_ACTIONS', () => {
  it('every partner type has the four CRM actions', () => {
    for (const typ of ['sv', 'makler', 'werkstatt', 'flotte'] as const) {
      for (const crm of ['notiz', 'anruf', 'email', 'einstufung'] as const) {
        expect(aktionenFuer(typ)).toContain(crm)
      }
    }
  })
  it('only SV+Werkstatt get verifizieren; only SV gets freischalten', () => {
    expect(aktionenFuer('sv')).toContain('verifizieren')
    expect(aktionenFuer('werkstatt')).toContain('verifizieren')
    expect(aktionenFuer('makler')).not.toContain('verifizieren')
    expect(aktionenFuer('flotte')).not.toContain('verifizieren')
    expect(aktionenFuer('sv')).toContain('freischalten')
    expect(aktionenFuer('werkstatt')).not.toContain('freischalten')
  })
  it('only Flotte gets deeplinks', () => {
    expect(aktionenFuer('flotte')).toContain('deeplinks')
    expect(aktionenFuer('sv')).not.toContain('deeplinks')
  })
  it('every action key has a German label', () => {
    for (const keys of Object.values(PARTNER_ACTIONS)) {
      for (const k of keys) expect(AKTION_LABEL[k]).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/partner/partner-actions.test.ts`
Expected: FAIL — "Cannot find module './partner-actions'".

- [ ] **Step 3: Write the config**

```typescript
// src/components/shared/partner/partner-actions.ts
// Config-getriebenes Aktions-Set je Partner-Typ (Spec §6). Pure Daten (kein React) ->
// unit-testbar. CRM-Aktionen (notiz/anruf/email/einstufung) oeffnen das Aktivitaets-Modal;
// operative (verifizieren/freischalten/sperren/deeplinks) sind Deep-Links in den jeweils
// bestehenden Tab/Flow (keine Re-Implementierung -> keine Duplikation).
import type { PartnerTyp } from '@/lib/partner/aktivitaet-types'

export type PartnerActionKey =
  | 'notiz' | 'anruf' | 'email' | 'einstufung'
  | 'verifizieren' | 'freischalten' | 'sperren' | 'deeplinks'

export const CRM_ACTIONS = ['notiz', 'anruf', 'email', 'einstufung'] as const

export const PARTNER_ACTIONS: Record<PartnerTyp, PartnerActionKey[]> = {
  sv:        ['notiz', 'anruf', 'email', 'einstufung', 'verifizieren', 'freischalten', 'sperren'],
  werkstatt: ['notiz', 'anruf', 'email', 'einstufung', 'verifizieren', 'sperren'],
  makler:    ['notiz', 'anruf', 'email', 'einstufung'],
  flotte:    ['notiz', 'anruf', 'email', 'einstufung', 'deeplinks'],
}

export function aktionenFuer(partnerTyp: PartnerTyp): PartnerActionKey[] {
  return PARTNER_ACTIONS[partnerTyp]
}

export const AKTION_LABEL: Record<PartnerActionKey, string> = {
  notiz: 'Notiz',
  anruf: 'Anruf protokollieren',
  email: 'E-Mail',
  einstufung: 'Einstufung',
  verifizieren: 'Verifizieren',
  freischalten: 'Freischalten',
  sperren: 'Sperren',
  deeplinks: 'Konto & Karten',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/partner/partner-actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/partner/partner-actions.ts src/components/shared/partner/partner-actions.test.ts
git commit -m "feat(partner-cockpit): PARTNER_ACTIONS config (typ->erlaubte aktionen)"
```

---

### Task 7: Server-Actions `partner-aktivitaet-actions.ts`

**Files:**
- Create: `src/app/admin/vertrieb/_actions/partner-aktivitaet-actions.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `requireVertriebStaff` (Task 4), `PARTNER_AKTIVITAET_MANUELL`/`PartnerTyp`/`PartnerAktivitaetRow` (Task 2).
- Produces (beides `'use server'`-Exports, aufrufbar vom Client):
  - `async function getPartnerAktivitaeten(partnerTyp: PartnerTyp, partnerId: string): Promise<{ ok: true; data: PartnerAktivitaetRow[] } | { ok: false; error: string }>`
  - `async function logManuelleAktivitaet(input: { partnerTyp: PartnerTyp; partnerId: string; typ: string; text: string; meta?: Record<string, unknown> | null }): Promise<{ ok: boolean; error?: string }>`
- Hinweis: **keine** `const`/`type`-Exports hier (AAR-664). `DETAIL_PATH` bleibt lokal.

- [ ] **Step 1: Write the server actions**

```typescript
// src/app/admin/vertrieb/_actions/partner-aktivitaet-actions.ts
'use server'

// Server-Actions fuer das Partner-Aktivitaets-Cockpit. Result-Object ({ ok, error }),
// staff-gated (requireVertriebStaff). Reads laufen ueber den authenticated-Client ->
// RLS partner_aktivitaeten_staff_all (is_staff()) greift. KEINE const/type-Exports (AAR-664).
import { createClient } from '@/lib/supabase/server'
import { requireVertriebStaff } from '@/lib/auth/require-vertrieb-staff'
import { PARTNER_AKTIVITAET_MANUELL } from '@/lib/partner/aktivitaet-types'
import type { PartnerTyp, PartnerAktivitaetRow } from '@/lib/partner/aktivitaet-types'
import { revalidatePath } from 'next/cache'

const DETAIL_PATH: Record<PartnerTyp, (id: string) => string> = {
  sv: (id) => `/admin/vertrieb/sachverstaendige/${id}`,
  makler: (id) => `/admin/vertrieb/makler/${id}`,
  werkstatt: (id) => `/admin/vertrieb/werkstaetten/${id}`,
  flotte: (id) => `/admin/vertrieb/firmen-flotte/${id}`,
}

export async function getPartnerAktivitaeten(
  partnerTyp: PartnerTyp,
  partnerId: string,
): Promise<{ ok: true; data: PartnerAktivitaetRow[] } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partner_aktivitaeten')
    .select('id, partner_typ, partner_id, typ, text, meta, ist_system, erstellt_von, erstellt_am')
    .eq('partner_typ', partnerTyp)
    .eq('partner_id', partnerId)
    .order('erstellt_am', { ascending: false })
    .limit(200)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as PartnerAktivitaetRow[] }
}

export async function logManuelleAktivitaet(input: {
  partnerTyp: PartnerTyp
  partnerId: string
  typ: string
  text: string
  meta?: Record<string, unknown> | null
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Aktivitäten protokollieren.' }

  if (!PARTNER_AKTIVITAET_MANUELL.includes(input.typ as (typeof PARTNER_AKTIVITAET_MANUELL)[number])) {
    return { ok: false, error: 'Ungültiger Aktivitätstyp.' }
  }
  const trimmed = (input.text ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Bitte einen Text eingeben.' }

  const supabase = await createClient()
  const { error } = await supabase.from('partner_aktivitaeten').insert({
    partner_typ: input.partnerTyp,
    partner_id: input.partnerId,
    typ: input.typ,
    text: trimmed,
    meta: input.meta ?? null,
    ist_system: false,
    erstellt_von: staff.id,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(DETAIL_PATH[input.partnerTyp](input.partnerId))
  return { ok: true }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (keine Fehler in der neuen Datei). Verhalten wird in Task 15 per Prod-Smoke bewiesen (die vitest-Suite ist pure/DB-frei — Server-Actions werden nicht unit-getestet, das ist Codebase-Konvention).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/vertrieb/_actions/partner-aktivitaet-actions.ts
git commit -m "feat(partner-cockpit): getPartnerAktivitaeten + logManuelleAktivitaet server-actions"
```

---

### Task 8: Komponente `PartnerAktivitaetsFeed` (präsentational)

**Files:**
- Create: `src/components/shared/partner/PartnerAktivitaetsFeed.tsx`

**Interfaces:**
- Consumes: `statusBadgeView` (`@/lib/status/resolve`), `PartnerAktivitaetRow` (Task 2), `Card` (`@/components/primitives`).
- Produces: `function PartnerAktivitaetsFeed({ rows, loading, compact }: { rows: PartnerAktivitaetRow[]; loading?: boolean; compact?: boolean }): JSX.Element` (präsentational — kein eigenes Fetching; `compact` = die letzten 5 + „mehr").

- [ ] **Step 1: Write the component**

```tsx
// src/components/shared/partner/PartnerAktivitaetsFeed.tsx
'use client'
// Praesentationaler Aktivitaets-Feed (Cockpit). Kein eigenes Fetching -> bekommt rows vom
// PartnerCockpitPanel. Typ->Label/Farbe ueber die Status-Registry (statusBadgeView), nie inline.
import { useState } from 'react'
import { Card } from '@/components/primitives'
import { statusBadgeView } from '@/lib/status/resolve'
import type { PartnerAktivitaetRow } from '@/lib/partner/aktivitaet-types'

function relativOderDatum(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min.`
  if (diffMin < 1440) return `vor ${Math.round(diffMin / 60)} Std.`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function PartnerAktivitaetsFeed({
  rows,
  loading = false,
  compact = false,
}: {
  rows: PartnerAktivitaetRow[]
  loading?: boolean
  compact?: boolean
}) {
  const [alleAnzeigen, setAlleAnzeigen] = useState(false)
  const sichtbar = compact && !alleAnzeigen ? rows.slice(0, 5) : rows

  if (loading) {
    return <p className="text-caption text-claimondo-ondo/60">Aktivitäten werden geladen…</p>
  }
  if (rows.length === 0) {
    return <p className="text-caption text-claimondo-ondo/60">Noch keine Aktivitäten erfasst.</p>
  }

  return (
    <div className="space-y-2">
      {sichtbar.map((r) => {
        const badge = statusBadgeView('partner-aktivitaet', r.typ)
        const autorName =
          r.ist_system
            ? 'System'
            : (r.meta && typeof r.meta['autor_name'] === 'string' ? (r.meta['autor_name'] as string) : 'Team')
        return (
          <Card key={r.id} p={3} radius="md">
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center rounded-ios-sm px-2 py-0.5 text-caption font-medium ${badge.slotClass}`}>
                {badge.label}
              </span>
              <span className="text-caption text-claimondo-ondo/60">{relativOderDatum(r.erstellt_am)}</span>
            </div>
            <p className="mt-1 text-sm text-claimondo-navy break-words whitespace-pre-wrap">{r.text}</p>
            <p className="mt-1 text-caption text-claimondo-ondo/60">{autorName}</p>
          </Card>
        )
      })}
      {compact && !alleAnzeigen && rows.length > 5 && (
        <button
          type="button"
          onClick={() => setAlleAnzeigen(true)}
          className="text-caption text-claimondo-ondo underline"
        >
          {rows.length - 5} weitere anzeigen
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/partner/PartnerAktivitaetsFeed.tsx
git commit -m "feat(partner-cockpit): PartnerAktivitaetsFeed (registry-styled chronik)"
```

---

### Task 9: Komponente `PartnerAktivitaetModal` (manuelles Erfassen)

**Files:**
- Create: `src/components/shared/partner/PartnerAktivitaetModal.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` (`@/components/ui/dialog`), `Button` (`@/components/primitives`), `logManuelleAktivitaet` (Task 7), `CRM_ACTIONS`/`AKTION_LABEL` (Task 6), `PartnerTyp` (Task 2).
- Produces: `function PartnerAktivitaetModal({ partnerTyp, partnerId, presetTyp, onClose, onLogged }: { partnerTyp: PartnerTyp; partnerId: string; presetTyp: string; onClose: () => void; onLogged: () => void }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
// src/components/shared/partner/PartnerAktivitaetModal.tsx
'use client'
// Modal zum manuellen Erfassen einer Aktivitaet (Anruf/Notiz/E-Mail/Einstufung).
// Rich-Dialog aus ui/* (shadcn) ist fuer Web-Desktop erlaubt (AGENTS §Komponenten-Set).
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/primitives'
import { logManuelleAktivitaet } from '@/app/admin/vertrieb/_actions/partner-aktivitaet-actions'
import { CRM_ACTIONS, AKTION_LABEL } from './partner-actions'
import type { PartnerTyp } from '@/lib/partner/aktivitaet-types'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

// Map: CRM-Aktions-Key -> Aktivitaets-typ (identisch benannt, aber explizit fuer Klarheit).
const KEY_TO_TYP: Record<(typeof CRM_ACTIONS)[number], string> = {
  notiz: 'notiz',
  anruf: 'anruf',
  email: 'email',
  einstufung: 'einstufung',
}

export function PartnerAktivitaetModal({
  partnerTyp,
  partnerId,
  presetTyp,
  onClose,
  onLogged,
}: {
  partnerTyp: PartnerTyp
  partnerId: string
  presetTyp: string
  onClose: () => void
  onLogged: () => void
}) {
  const initialTyp = (CRM_ACTIONS as readonly string[]).includes(presetTyp) ? presetTyp : 'notiz'
  const [typ, setTyp] = useState<string>(initialTyp)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function speichern() {
    setBusy(true)
    setFehler(null)
    const res = await logManuelleAktivitaet({
      partnerTyp,
      partnerId,
      typ: KEY_TO_TYP[typ as (typeof CRM_ACTIONS)[number]] ?? 'notiz',
      text,
    })
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Fehler beim Speichern.')
      return
    }
    onLogged()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aktivität erfassen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-caption text-claimondo-ondo/60">Typ</label>
            <select value={typ} onChange={(e) => setTyp(e.target.value)} className={`${FELD_CLS} w-full`}>
              {CRM_ACTIONS.map((k) => (
                <option key={k} value={k}>{AKTION_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-caption text-claimondo-ondo/60">Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Was ist passiert?"
              className={`${FELD_CLS} w-full resize-y`}
            />
          </div>
          {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button variant="navy" size="sm" onClick={speichern} loading={busy} disabled={busy || !text.trim()}>
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Falls `@/components/ui/dialog` andere Export-Namen hat (z.B. kein `DialogHeader`): die vorhandenen shadcn-Exporte aus `src/components/ui/dialog.tsx` verwenden (Datei kurz lesen) — Struktur bleibt (Titel + Body).

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/partner/PartnerAktivitaetModal.tsx
git commit -m "feat(partner-cockpit): PartnerAktivitaetModal (manuelles erfassen)"
```

---

### Task 10: Komponente `PartnerActionBar` (config-getriebene Buttons)

**Files:**
- Create: `src/components/shared/partner/PartnerActionBar.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/primitives`), `useRouter` (`next/navigation`), `aktionenFuer`/`AKTION_LABEL`/`CRM_ACTIONS`/`PartnerActionKey` (Task 6), `PartnerTyp` (Task 2).
- Produces: `function PartnerActionBar({ partnerTyp, partnerId, onCrmAction }: { partnerTyp: PartnerTyp; partnerId: string; onCrmAction: (typ: string) => void }): JSX.Element` — CRM-Keys → `onCrmAction(key)`; operative Keys → Deep-Link (router.push) in den bestehenden Flow.

- [ ] **Step 1: Write the component**

```tsx
// src/components/shared/partner/PartnerActionBar.tsx
'use client'
// Config-getriebene Aktions-Leiste (Spec §6). CRM-Keys oeffnen das Modal (onCrmAction);
// operative Keys sind Deep-Links in den bestehenden Tab/Flow (keine Re-Implementierung).
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { aktionenFuer, AKTION_LABEL, CRM_ACTIONS, type PartnerActionKey } from './partner-actions'
import type { PartnerTyp } from '@/lib/partner/aktivitaet-types'

// Deep-Link-Ziel je operativer Aktion + Partner-Typ (fuehrt in den bestehenden Flow,
// wo die Action tatsaechlich lebt — Verifizierungs-/Onboarding-Tab bzw. Konto/Karten).
function deepLink(key: PartnerActionKey, partnerTyp: PartnerTyp, partnerId: string): string | null {
  if (key === 'verifizieren' || key === 'freischalten' || key === 'sperren') {
    if (partnerTyp === 'sv') return `/admin/vertrieb/sachverstaendige/${partnerId}?tab=verifizierung`
    if (partnerTyp === 'werkstatt') return `/admin/vertrieb/werkstaetten/${partnerId}?tab=zugang`
  }
  if (key === 'deeplinks' && partnerTyp === 'flotte') return `/admin/vertrieb/firmen-flotte/${partnerId}`
  return null
}

export function PartnerActionBar({
  partnerTyp,
  partnerId,
  onCrmAction,
}: {
  partnerTyp: PartnerTyp
  partnerId: string
  onCrmAction: (typ: string) => void
}) {
  const router = useRouter()
  const keys = aktionenFuer(partnerTyp)
  const istCrm = (k: PartnerActionKey) => (CRM_ACTIONS as readonly string[]).includes(k)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {keys.map((k) => {
        if (istCrm(k)) {
          return (
            <Button key={k} variant={k === 'notiz' ? 'navy' : 'ghost'} size="sm" onClick={() => onCrmAction(k)}>
              {AKTION_LABEL[k]}
            </Button>
          )
        }
        const href = deepLink(k, partnerTyp, partnerId)
        if (!href) return null
        return (
          <Button key={k} variant="ghost" size="sm" onClick={() => router.push(href)}>
            {AKTION_LABEL[k]}
          </Button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/partner/PartnerActionBar.tsx
git commit -m "feat(partner-cockpit): PartnerActionBar (config-getriebene aktionen + deep-links)"
```

---

### Task 11: Composite `PartnerCockpitPanel`

**Files:**
- Create: `src/components/shared/partner/PartnerCockpitPanel.tsx`

**Interfaces:**
- Consumes: `getPartnerAktivitaeten` (Task 7), `PartnerActionBar` (Task 10), `PartnerAktivitaetModal` (Task 9), `PartnerAktivitaetsFeed` (Task 8), `PartnerAktivitaetRow`/`PartnerTyp` (Task 2).
- Produces: `function PartnerCockpitPanel({ partnerTyp, partnerId, compact }: { partnerTyp: PartnerTyp; partnerId: string; compact?: boolean }): JSX.Element` — die **eine** Einheit, die in Seiten + Drawer eingehängt wird.

- [ ] **Step 1: Write the component**

```tsx
// src/components/shared/partner/PartnerCockpitPanel.tsx
'use client'
// Das Partner-Cockpit als eine Einheit: laedt die Chronik (getPartnerAktivitaeten),
// rendert ActionBar + Feed + Modal. Wird in die 4 [id]-Detail-Seiten (voll) und in den
// Drawer PartnerCockpit.tsx (compact) eingehaengt. Client, weil es via Server-Action laedt
// und im 'use client'-Drawer laufen muss.
import { useCallback, useEffect, useState } from 'react'
import { getPartnerAktivitaeten } from '@/app/admin/vertrieb/_actions/partner-aktivitaet-actions'
import type { PartnerAktivitaetRow, PartnerTyp } from '@/lib/partner/aktivitaet-types'
import { PartnerActionBar } from './PartnerActionBar'
import { PartnerAktivitaetModal } from './PartnerAktivitaetModal'
import { PartnerAktivitaetsFeed } from './PartnerAktivitaetsFeed'

export function PartnerCockpitPanel({
  partnerTyp,
  partnerId,
  compact = false,
}: {
  partnerTyp: PartnerTyp
  partnerId: string
  compact?: boolean
}) {
  const [rows, setRows] = useState<PartnerAktivitaetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalTyp, setModalTyp] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const res = await getPartnerAktivitaeten(partnerTyp, partnerId)
    if (res.ok) setRows(res.data)
    setLoading(false)
  }, [partnerTyp, partnerId])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="space-y-3">
      <PartnerActionBar partnerTyp={partnerTyp} partnerId={partnerId} onCrmAction={setModalTyp} />
      <PartnerAktivitaetsFeed rows={rows} loading={loading} compact={compact} />
      {modalTyp && (
        <PartnerAktivitaetModal
          partnerTyp={partnerTyp}
          partnerId={partnerId}
          presetTyp={modalTyp}
          onClose={() => setModalTyp(null)}
          onLogged={() => {
            setModalTyp(null)
            void reload()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/partner/PartnerCockpitPanel.tsx
git commit -m "feat(partner-cockpit): PartnerCockpitPanel composite (fetch + actionbar + feed + modal)"
```

---

### Task 12: Einhängen in die 4 `[id]`-Detail-Seiten

**Files:**
- Modify: `src/app/admin/vertrieb/makler/[id]/page.tsx`
- Modify: `src/app/admin/vertrieb/sachverstaendige/[id]/page.tsx`
- Modify: `src/app/admin/vertrieb/werkstaetten/[id]/page.tsx`
- Modify: `src/app/admin/vertrieb/firmen-flotte/[id]/page.tsx`

**Interfaces:**
- Consumes: `PartnerCockpitPanel` (Task 11). Server-Component-Seite rendert die Client-Komponente als Kind (erlaubt).
- **Mount-Regel für alle 4:** Import ergänzen und `<PartnerCockpitPanel partnerTyp="<typ>" partnerId={id} />` als eigene „Aktivität"-Sektion **additiv** im Hauptinhalt rendern (keine bestehende Sektion ersetzen). `<typ>` = `sv` | `makler` | `werkstatt` | `flotte`.

- [ ] **Step 1: Makler-Seite (exakter Edit)**

In `src/app/admin/vertrieb/makler/[id]/page.tsx` den Import ergänzen (nach Zeile 12, `getMaklerAdminDetail`-Import):

```typescript
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'
```

Im Stammdaten-Zweig (der `else`-Block ab Zeile 158, innerhalb `<div className="flex-1 overflow-y-auto p-4">`) **nach** der schließenden `</Card>` (Zeile 174) und **vor** dem schließenden `</div>` (Zeile 175) einfügen:

```tsx
            <div className="mt-6 max-w-3xl">
              <h3 className="text-heading-sm text-claimondo-navy mb-2">Aktivität</h3>
              <PartnerCockpitPanel partnerTyp="makler" partnerId={id} />
            </div>
```

- [ ] **Step 2: SV-Seite**

`src/app/admin/vertrieb/sachverstaendige/[id]/page.tsx` lesen. Import ergänzen:

```typescript
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'
```

Im Haupt-/Übersichtsbereich der Seite (die Stelle, an der die Stammdaten/Übersicht gerendert werden — **nicht** in einen bestehenden reichen Tab wie „Verifizierung" schachteln) additiv einfügen:

```tsx
            <div className="mt-6">
              <h3 className="text-heading-sm text-claimondo-navy mb-2">Aktivität</h3>
              <PartnerCockpitPanel partnerTyp="sv" partnerId={id} />
            </div>
```

(`id` = der aufgelöste Params-Wert der Seite; falls die Seite die ID unter anderem Namen hält, den vorhandenen Namen verwenden.)

- [ ] **Step 3: Werkstatt-Seite**

`src/app/admin/vertrieb/werkstaetten/[id]/page.tsx` lesen. Import ergänzen:

```typescript
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'
```

Additiv im Hauptinhalt einfügen:

```tsx
            <div className="mt-6">
              <h3 className="text-heading-sm text-claimondo-navy mb-2">Aktivität</h3>
              <PartnerCockpitPanel partnerTyp="werkstatt" partnerId={id} />
            </div>
```

- [ ] **Step 4: Flotte-Seite**

`src/app/admin/vertrieb/firmen-flotte/[id]/page.tsx` lesen. Import ergänzen:

```typescript
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'
```

Additiv **nach** dem bestehenden „Notizen (intern)"-Block einfügen (das Cockpit ergänzt die Einzel-Notiz, ersetzt sie nicht):

```tsx
            <div className="mt-6">
              <h3 className="text-heading-sm text-claimondo-navy mb-2">Aktivität</h3>
              <PartnerCockpitPanel partnerTyp="flotte" partnerId={id} />
            </div>
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: grün (Next.js 15 validiert Server/Client-Grenzen zur Build-Zeit — voller Build, nicht nur `tsc`, weil Routen betroffen sind).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/vertrieb/makler/[id]/page.tsx src/app/admin/vertrieb/sachverstaendige/[id]/page.tsx src/app/admin/vertrieb/werkstaetten/[id]/page.tsx src/app/admin/vertrieb/firmen-flotte/[id]/page.tsx
git commit -m "feat(partner-cockpit): mount PartnerCockpitPanel in alle 4 [id]-detail-views"
```

---

### Task 13: Kompakte Variante in den Drawer `PartnerCockpit.tsx`

**Files:**
- Modify: `src/app/admin/vertrieb/drawer/PartnerCockpit.tsx`

**Interfaces:**
- Consumes: `PartnerCockpitPanel` (Task 11). Der Drawer ist `'use client'` und rendert `kontakt` (VertriebKontakt) — `kontakt.kind` ist `'sv' | 'makler' | 'werkstatt'`.
- Produces: der Drawer zeigt zusätzlich den kompakten Feed.

- [ ] **Step 1: Import ergänzen**

In `src/app/admin/vertrieb/drawer/PartnerCockpit.tsx` nach Zeile 14 (nach dem `VertriebKontakt`-Type-Import) ergänzen:

```typescript
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'
```

- [ ] **Step 2: Panel einhängen**

Innerhalb des `return` (nach dem „Notizen (intern)"-Block, vor dem abschließenden Deep-Link-`<Button>` bei Zeile 144) einfügen:

```tsx
      <div className="space-y-2">
        <p className="text-caption text-claimondo-ondo/60">Aktivität</p>
        <PartnerCockpitPanel partnerTyp={kontakt.kind} partnerId={kontakt.id} compact />
      </div>
```

(`kontakt.kind` ist bereits `'sv' | 'makler' | 'werkstatt'` — ein Subtyp von `PartnerTyp`, also typkompatibel ohne Mapping.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: grün.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/vertrieb/drawer/PartnerCockpit.tsx
git commit -m "feat(partner-cockpit): kompaktes cockpit-panel im vertrieb-drawer"
```

---

### Task 14: System-Event-Wiring in 4 operative Actions

**Files:**
- Modify: `src/app/admin/sachverstaendige/[id]/verifizierung-actions.ts` (`gibBasicSvFrei` :408, `svSperren` :176)
- Modify: `src/app/admin/sachverstaendige/[id]/actions.ts` (`setzeSvVerifiziert` :147)
- Modify: `src/app/admin/werkstaetten/actions.ts` (`setWerkstattVerifiziert` :223)

**Interfaces:**
- Consumes: `logPartnerEvent` (Task 5). Jede Einhängung ist **fire-and-forget** (`await logPartnerEvent(...)` — der Helper try/catcht selbst, bricht also den Haupt-Write nie) und wird **unmittelbar vor dem Erfolgs-`return`** platziert (nach dem erfolgreichen DB-Write / `revalidatePath`).
- Rückgabe-Shapes bleiben unverändert: `gibBasicSvFrei`/`svSperren`/`setzeSvVerifiziert` → `{ success, error }`, `setWerkstattVerifiziert` → `{ ok, error }`.

- [ ] **Step 1: `verifizierung-actions.ts` — Import + 2 Events**

Import am Dateianfang (bei den übrigen Imports) ergänzen:

```typescript
import { logPartnerEvent } from '@/lib/partner/log-partner-event'
```

In `gibBasicSvFrei(svId)` unmittelbar **vor** dem finalen `return { success: true }` (Erfolgs-Pfad) einfügen:

```typescript
  await logPartnerEvent({ partnerTyp: 'sv', partnerId: svId, typ: 'freigeschaltet', text: 'SV ins Portal freigeschaltet' })
```

In `svSperren(svId, grund)` unmittelbar **vor** dem finalen `return { success: true }` einfügen:

```typescript
  await logPartnerEvent({ partnerTyp: 'sv', partnerId: svId, typ: 'gesperrt', text: `SV gesperrt${grund ? `: ${grund}` : ''}` })
```

- [ ] **Step 2: `sachverstaendige/[id]/actions.ts` — `setzeSvVerifiziert`**

Import ergänzen:

```typescript
import { logPartnerEvent } from '@/lib/partner/log-partner-event'
```

In `setzeSvVerifiziert(svId, verifiziert)` unmittelbar **vor** dem Erfolgs-`return` einfügen (nur beim Verifizieren, nicht beim Zurücksetzen):

```typescript
  if (verifiziert) {
    await logPartnerEvent({ partnerTyp: 'sv', partnerId: svId, typ: 'verifiziert', text: 'SV verifiziert' })
  }
```

- [ ] **Step 3: `werkstaetten/actions.ts` — `setWerkstattVerifiziert`**

Import ergänzen:

```typescript
import { logPartnerEvent } from '@/lib/partner/log-partner-event'
```

In `setWerkstattVerifiziert(werkstattId, verifiziert, notiz?)` unmittelbar **vor** dem Erfolgs-`return { ok: true }` einfügen (nur beim Verifizieren):

```typescript
  if (verifiziert) {
    await logPartnerEvent({ partnerTyp: 'werkstatt', partnerId: werkstattId, typ: 'verifiziert', text: `Werkstatt verifiziert${notiz ? `: ${notiz}` : ''}` })
  }
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: grün.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sachverstaendige/[id]/verifizierung-actions.ts src/app/admin/sachverstaendige/[id]/actions.ts src/app/admin/werkstaetten/actions.ts
git commit -m "feat(partner-cockpit): logPartnerEvent in freischalten/sperren/verifizieren (SV+WS)"
```

---

### Task 15: Voller Build, Ratchets + Regel-4-Prod-Smoke

**Files:** keine (Verifikations-Task).

**Interfaces:** Consumes alles. Produces den Abschluss-Beweis (grüner Prod-Smoke je Partner-Typ).

- [ ] **Step 1: Voller Build + alle relevanten Ratchets**

Run:
```bash
npm run build
npx vitest run src/lib/partner src/lib/status/domains/partner-aktivitaet.test.ts src/lib/auth src/components/shared/partner
npm run check:component-set && npm run check:status-registry && npm run check:knip && npm run check:token-audit && npm run check:flag-drift && npm run check:rls-policies && npm run check:anon-sensitive-grants && npm run check:query-drift
```
Expected: alles grün. Bei rotem Ratchet: gemäß dem jeweiligen Gate fixen (nicht die Baseline aufblähen).

- [ ] **Step 2: PR öffnen + mergen (Regel 1)**

PR gegen **staging** öffnen (7-Punkte-Audit im Body). Nach Review → Merge → staging→main (Squash) → VPS-Deploy (deploy-vps*.yml, NICHT Vercel).

- [ ] **Step 3: Regel-4-Prod-Smoke (Playwright gegen `https://app.claimondo.de`)**

Vorbereitung: Wegwerf-Partner je Typ mit `telefon = NULL` (kein echter Kunde). Staff-Login `smoke-admin@claimondo.test` (PW aus Memory `reference-smoke-admin-prod-password`).

Pro Partner-Typ (SV, Makler, Werkstatt, Flotte) diesen Flow:
1. Detail-View öffnen (`/admin/vertrieb/<typ>/[id]`) → **„Aktivität"-Sektion rendert** (kein Crash, Feed sichtbar — leer oder mit Backfill).
2. „Notiz" klicken → Modal → Text „Smoke-Test 2026-08-04" → Speichern → **Eintrag erscheint sofort im Feed** (Label „Notiz", Text, „Team").
3. DB-Verifikation (READ): `select typ, text, ist_system, erstellt_von from partner_aktivitaeten where partner_typ='<typ>' and partner_id='<id>' order by erstellt_am desc limit 1;` → die Notiz mit `ist_system=false`, `erstellt_von=<staff-id>`.
4. Cleanup: die Smoke-Notiz wieder löschen (`delete from partner_aktivitaeten where id='<smoke-id>'`) → **0 Residue**.

System-Event-Smoke (nur SV, non-destruktiv über Wegwerf-SV):
5. SV freischalten (`gibBasicSvFrei` über die UI) → im Feed erscheint **„Freigeschaltet" (System)**; DB: `typ='freigeschaltet', ist_system=true, erstellt_von IS NULL`. Danach den Wegwerf-SV-Zustand zurücksetzen/Event löschen (0 Residue).

- [ ] **Step 4: Ergebnis dokumentieren**

Smoke-Ergebnis (grün/rot + Assertions/Screenshots) im PR + im Koordinations-Marker festhalten. **Rot →** Fix als neuer PR; Task bleibt offen bis grün.

---

## Folge-Schritte (NICHT in diesem Plan — eigene Pläne/PRs)

- **F2 Route-Konsolidierung** (Spec §8): SV/Werkstatt-Doppel-/Tripel-Routen auf eine kanonische Route zusammenführen (Redirect via `next.config.ts` + Duplikat-`page.tsx` löschen; Redirect-Stub-Gate). Betrifft Consumer-Links → eigener Regression-Check.
- **F4 GMaps-Fix** (Spec §9): Google-Maps-Doppel-Load auf `/admin/sachverstaendige/[id]` (Singleton-Loader). Kleiner, sofort mergebarer PR.
- **Inkrementelle System-Events** (Spec §7): `lead_zugewiesen` (SV-Zuweisung / Werkstatt-Vermittlung), `provision` (Provisions-Release), `vertrag`, `statuswechsel` — je ein 1-Zeilen-`logPartnerEvent`-Aufruf, sobald die Ziel-Action geerdet ist.

## Self-Review-Notiz (writing-plans)

- **Spec-Abdeckung:** §4 Datenmodell → T1/T2; §5 Komponenten+Actions → T7–T11; §5 Notizen-Reconciliation (Backfill) → T1; §6 Aktions-Set → T6/T10; §7 System-Events (hochwertige zuerst) → T14 (Rest als Folge-Schritt markiert, spec-konform); §10 Security/RLS/Migration/Ratchets/Tests/Rollout → T1/T7/T15; §8/§9 explizit als Folge-Schritte ausgeklammert (spec-konform).
- **Typ-Konsistenz:** `PartnerTyp`/`PartnerAktivitaetTyp`/`PartnerAktivitaetRow` (T2) durchgängig in T3/T5/T7/T8/T9/T10/T11; `getPartnerAktivitaeten(partnerTyp, partnerId)`-Signatur identisch in T7 (Def) und T11 (Consumer); `logManuelleAktivitaet`-Input-Shape identisch in T7 (Def) und T9 (Consumer); `logPartnerEvent`-Input identisch in T5 (Def) und T14 (Consumer).
- **Platzhalter:** keine „TBD/TODO"; jeder Code-Schritt trägt vollständigen Code. Bei T12 (SV/WS/Flotte) ist das einzufügende Element vollständig spezifiziert; der genaue Anker wird beim Lesen der jeweiligen (heterogenen) Seite bestätigt — additive Sektion, ersetzt nichts.
