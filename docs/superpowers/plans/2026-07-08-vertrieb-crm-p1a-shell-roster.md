# Vertrieb-CRM P1a (Shell + Roster) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Der erste sichtbare UI-Schritt des Vertrieb-CRM — ein `/admin/vertrieb`-Roster, das
die P0-Datenschicht (155 Partner-Kontakte über 5 Silos) mit Stufe-Badge, kind-Segmenten und
Triage-KPIs anzeigt.

**Architecture:** RSC-Seite lädt einen Staff-gegateten Server-Loader (`getVertriebDaten` =
`requireRole` + `createAdminClient` + P0-`getVertriebKontakte`/`getVertriebRollup`), reicht die
Daten an einen Client-Roster (`shared/DataTable` + `<StatusBadge domain="vertrieb-workflow">` +
kind-Segment-Tabs + KPIs). Additiver AdminNav-Eintrag. Baut auf P0 (gleicher Branch, extends #3960).

**Tech Stack:** Next.js 15 RSC, `src/lib/auth/guards` (requireRole → GuardResult), `createAdminClient`,
`@/components/shared/DataTable`, `@/components/shared/StatusBadge`, `@/components/ui/tabs`.

**Spec:** `docs/superpowers/specs/2026-07-08-vertrieb-crm-umbrella-design.md` §4① · **P0:**
`src/lib/vertrieb/*` (getVertriebKontakte/getVertriebRollup, VertriebKontakt/VertriebRollupZelle).

## Global Constraints

- **Views sind service_role-only** → Admin-Client NUR nach Staff-Role-Guard lesen (kein IDOR).
  `requireRole` gibt `GuardResult` (`{ success: boolean; error?: string; user; supabase }`, wirft NICHT).
- **UI-Strings mit echten Umlauten** (ä/ö/ü/ß). **Design-Tokens** (claimondo-*), keine Tailwind-
  Defaults/raw-hex. **Stufe-Badge NUR via `<StatusBadge domain="vertrieb-workflow" code=... />`**
  (status-registry-Ratchet), keine inline-Farb-Map.
- **Komponenten-Set:** Tabelle via `shared/DataTable` (kein handgerolltes `<table>`), Buttons/Cards
  via `primitives/*`. Tabs via `@/components/ui/tabs`.
- **AdminNav additiv:** neuer Eintrag, `/admin/partner-leads`-Eintrag BLEIBT (e8aa73d4 verschiebt
  ihn später — kein Redirect, kein Entfernen).
- **Ratchets** (token-audit/component-set/status-registry/knip) `-- --ratchet` 0-neu NACH `git add`.
- **Server-Actions/Loader:** Result-Object. **Kein Export von Konstanten aus 'use server'-Files.**

**⚠ NICHT P1a (spätere Inkremente):** Housing/Verlinken von partner-leads (P1b), Kanban/Pipeline,
Filter/Suche, Owner-Spalte, Karte (P3), Detail-Drawer (P2). P1a = read-only Roster-Tabelle + Segmente + KPIs.

---

## Task 1: Server-Loader `getVertriebDaten` (Staff-Guard + Admin-Client + P0-Loader)

**Files:**
- Create: `src/app/admin/vertrieb/_lib/get-vertrieb-daten.ts`
- Test: `src/app/admin/vertrieb/_lib/get-vertrieb-daten.test.ts`

**Interfaces:**
- Consumes: `requireRole` (`@/lib/auth/guards`), `createAdminClient` (`@/lib/supabase/admin`),
  `getVertriebKontakte`/`getVertriebRollup` (`@/lib/vertrieb/*`).
- Produces: `getVertriebDaten(): Promise<{ ok: true; kontakte: VertriebKontakt[]; rollup: VertriebRollupZelle[] } | { ok: false; error: string }>`.

- [ ] **Step 1: Failing test** — mock `requireRole` (staff/non-staff) + `createAdminClient` +
  die P0-Loader. Assert: non-staff → `{ ok:false }`; staff → `{ ok:true, kontakte, rollup }`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const { role } = vi.hoisted(() => ({ role: { ok: true as boolean } }))
vi.mock('@/lib/auth/guards', () => ({ requireRole: async () => role.ok ? { success: true, user: { id: 'u' } } : { success: false, error: 'nope', user: null } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/vertrieb/get-vertrieb-kontakte', () => ({ getVertriebKontakte: async () => ({ ok: true, data: [{ id: 'a', kind: 'sv', stufe: 'aktiv' }] }) }))
vi.mock('@/lib/vertrieb/get-vertrieb-rollup', () => ({ getVertriebRollup: async () => ({ ok: true, data: [{ kind: 'sv', stufe: 'aktiv', anzahl: 1 }] }) }))
import { getVertriebDaten } from './get-vertrieb-daten'
beforeEach(() => { role.ok = true })
describe('getVertriebDaten', () => {
  it('non-staff -> ok:false', async () => { role.ok = false; expect((await getVertriebDaten()).ok).toBe(false) })
  it('staff -> kontakte + rollup', async () => {
    const r = await getVertriebDaten()
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.kontakte).toHaveLength(1); expect(r.rollup).toHaveLength(1) }
  })
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementieren:**

```ts
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVertriebKontakte } from '@/lib/vertrieb/get-vertrieb-kontakte'
import { getVertriebRollup } from '@/lib/vertrieb/get-vertrieb-rollup'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebRollupZelle } from '@/lib/vertrieb/vertrieb-rollup.types'

export async function getVertriebDaten(): Promise<
  { ok: true; kontakte: VertriebKontakt[]; rollup: VertriebRollupZelle[] } | { ok: false; error: string }
> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()
  const [k, r] = await Promise.all([getVertriebKontakte(admin), getVertriebRollup(admin)])
  if (!k.ok) return k
  if (!r.ok) return r
  return { ok: true, kontakte: k.data, rollup: r.data }
}
```
  ⚠ Falls tsc meckert, dass `'dispatch'` kein `UserRolle` ist: die erlaubten Rollen an den
  `UserRolle`-Typ (src/lib/auth/guards) angleichen (admin ist sicher dabei; ggf. nur `['admin']`).

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(vertrieb): getVertriebDaten Staff-Loader (P1a T1)`.

---

## Task 2: `/admin/vertrieb`-Seite + Roster-Client

**Files:**
- Create: `src/app/admin/vertrieb/page.tsx` (RSC)
- Create: `src/app/admin/vertrieb/VertriebRosterClient.tsx` (Client)

**Interfaces:**
- Consumes: `getVertriebDaten` (Task 1), `VertriebKontakt`/`VertriebRollupZelle`,
  `@/components/shared/DataTable`, `@/components/shared/StatusBadge`, `@/components/ui/tabs`.

- [ ] **Step 1: Vorbild lesen** — eine bestehende Admin-RSC-Seite (z.B.
  `src/app/admin/sachverstaendige/basic-freigaben/page.tsx`) fürs Page/Loader/DataTable-Muster +
  `src/components/shared/DataTable` (exakte Exports: `Table/Thead/Tbody/Tr/Th/Td/DataTableContainer`)
  + `StatusBadge`-Props (`domain`, `code`, `size`).

- [ ] **Step 2: RSC `page.tsx`:**

```tsx
import { getVertriebDaten } from './_lib/get-vertrieb-daten'
import VertriebRosterClient from './VertriebRosterClient'
import PageHeader from '@/components/shared/PageHeader'

export default async function VertriebPage() {
  const res = await getVertriebDaten()
  return (
    <div className="px-4 sm:px-6 py-6">
      <PageHeader title="Vertrieb" subtitle="Partner & Leads — alle Typen, ein Roster" />
      {res.ok
        ? <VertriebRosterClient kontakte={res.kontakte} rollup={res.rollup} />
        : <p className="text-sm text-danger">{res.error}</p>}
    </div>
  )
}
```
  (PageHeader-Props gegen die Komponente prüfen; ggf. `title`/`subtitle` anpassen.)

- [ ] **Step 3: `VertriebRosterClient.tsx`** — KPIs (aus rollup) + kind-Segment-Tabs + DataTable
  mit Stufe-Badge. Muster (DataTable/StatusBadge/Tabs-Imports gegen die Komponenten verifizieren):

```tsx
'use client'
import { useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { VertriebKontakt, VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebRollupZelle } from '@/lib/vertrieb/vertrieb-rollup.types'

const KIND_LABEL: Record<VertriebKind | 'alle', string> = {
  alle: 'Alle', sv: 'Sachverständige', makler: 'Makler', werkstatt: 'Werkstätten',
  'partner-lead': 'Partner-Leads', 'sv-lead': 'SV-Leads',
}
const SEGMENTE: (VertriebKind | 'alle')[] = ['alle', 'sv', 'makler', 'werkstatt', 'partner-lead', 'sv-lead']

export default function VertriebRosterClient({ kontakte, rollup }: { kontakte: VertriebKontakt[]; rollup: VertriebRollupZelle[] }) {
  const [seg, setSeg] = useState<VertriebKind | 'alle'>('alle')
  const gefiltert = useMemo(() => seg === 'alle' ? kontakte : kontakte.filter(k => k.kind === seg), [kontakte, seg])
  const kpi = useMemo(() => {
    const sum = (pred: (z: VertriebRollupZelle) => boolean) => rollup.filter(pred).reduce((a, z) => a + z.anzahl, 0)
    return {
      leads: sum(z => z.kind === 'partner-lead' || z.kind === 'sv-lead'),
      onboarding: sum(z => z.stufe === 'onboarding'),
      aktiv: sum(z => z.stufe === 'aktiv'),
      gesperrt: sum(z => z.stufe === 'gesperrt'),
    }
  }, [rollup])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([['Leads', kpi.leads], ['Onboarding', kpi.onboarding], ['Aktiv', kpi.aktiv], ['Gesperrt', kpi.gesperrt]] as const).map(([l, n]) => (
          <div key={l} className="rounded-ios-lg border border-claimondo-border bg-white p-4">
            <p className="text-caption text-claimondo-ondo/70">{l}</p>
            <p className="text-heading-md text-claimondo-navy">{n}</p>
          </div>
        ))}
      </div>
      <Tabs value={seg} onValueChange={(v) => setSeg(v as VertriebKind | 'alle')}>
        <TabsList className="overflow-x-auto">
          {SEGMENTE.map(s => <TabsTrigger key={s} value={s}>{KIND_LABEL[s]}</TabsTrigger>)}
        </TabsList>
        {SEGMENTE.map(s => (
          <TabsContent key={s} value={s}>
            <DataTableContainer>
              <Table>
                <Thead><Tr><Th>Name</Th><Th>Typ</Th><Th>Stufe</Th><Th>Ort</Th><Th>Kontakt</Th></Tr></Thead>
                <Tbody>
                  {gefiltert.map(k => (
                    <Tr key={`${k.kind}-${k.id}`}>
                      <Td>{k.name ?? '—'}</Td>
                      <Td>{KIND_LABEL[k.kind]}</Td>
                      <Td><StatusBadge domain="vertrieb-workflow" code={k.stufe} size="sm" /></Td>
                      <Td>{k.plz ? `${k.plz} ${k.ort ?? ''}`.trim() : (k.ort ?? '—')}</Td>
                      <Td>{k.email ?? k.telefon ?? '—'}</Td>
                    </Tr>
                  ))}
                  {gefiltert.length === 0 && <Tr><Td>Keine Einträge</Td></Tr>}
                </Tbody>
              </Table>
            </DataTableContainer>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 4: `npx tsc --noEmit`** grün auf die neuen Files (DataTable/StatusBadge/Tabs/PageHeader-
  Imports + Props exakt an die Komponenten anpassen — das ist der Haupt-Fixpunkt dieses Tasks).
- [ ] **Step 5: Commit** `feat(vertrieb): /admin/vertrieb Roster-Seite + Segmente + KPIs (P1a T2)`.

---

## Task 3: Additiver AdminNav-Eintrag „Vertrieb"

**Files:**
- Modify: `src/app/admin/_components/AdminNav.tsx` (NAV_ITEMS-Array + Icon-Import)

- [ ] **Step 1:** Icon importieren (z.B. `Contact2Icon`/`HandshakeIcon` aus lucide-react, das noch
  nicht genutzt wird) und einen Eintrag ins `NAV_ITEMS`-Array einfügen — sinnvoll VOR `Sachverständige`
  oder `Partner-Leads` gruppiert:

```tsx
{ href: '/admin/vertrieb', label: 'Vertrieb', icon: HandshakeIcon },
```
  ⚠ **`/admin/partner-leads`-Eintrag NICHT entfernen/verschieben** (e8aa73d4-Lane, [[coordination-vertrieb-crm]]).
- [ ] **Step 2:** `npx tsc --noEmit` grün. **Step 3: Commit** `feat(vertrieb): AdminNav-Eintrag Vertrieb (additiv, P1a T3)`.

---

## Task 4: P1a-Abschluss — Build + Ratchets + Prod-Smoke

- [ ] **Step 1:** `npm run build` grün (Route-Validator prüft die neue Seite).
- [ ] **Step 2:** Alle 4 Ratchets `-- --ratchet` NACH `git add` → 0-neu (v.a. component-set: DataTable
  genutzt, kein handgerolltes `<table>`; status-registry: Stufe via StatusBadge, keine inline-Map).
- [ ] **Step 3:** `npx vitest run src/app/admin/vertrieb src/lib/vertrieb` grün.
- [ ] **Step 4: Prod-Smoke** (nach Deploy) als `test-admin`/`nicolas.kitta` (2FA jetzt optional) via
  Playwright: `/admin/vertrieb` lädt, KPIs + Segment-Tabs + Roster-Tabelle mit Stufe-Badges sichtbar,
  Segment-Wechsel filtert, kein 5xx. Bis 1+.
- [ ] **Step 5:** Marker `COORDINATION-vertrieb-crm.md` fortschreiben (P1a live) + PR (#3960 wächst,
  oder eigener P1a-PR falls #3960 schon gemergt).

---

## Self-Review

**1. Spec-Abdeckung:** §4① Roster (Tabelle + kind-Segmente + Triage-KPIs) → Task 2. Staff-gegateter
Read → Task 1. Nav-Einstieg → Task 3. Housing/Kanban/Filter/Karte bewusst ausgeklammert (spätere Inkremente).

**2. Placeholder-Scan:** Kein TBD. Die „gegen die Komponente verifizieren"-Hinweise sind bewusst
(DataTable/StatusBadge/PageHeader-APIs müssen beim Bau exakt getroffen werden) — kein Platzhalter,
sondern der konkrete Fixpunkt je Task.

**3. Typ-Konsistenz:** `getVertriebDaten`-Return (kontakte/rollup) == Task-2-Props. `VertriebKontakt`/
`VertriebRollupZelle`/`VertriebKind` aus P0 konsistent genutzt. `StatusBadge domain="vertrieb-workflow"`
== Task-1-Registry (P0).

**4. Scope:** additiv (neue Seite + 1 Nav-Zeile), read-only, kollisionsfrei (AdminNav kalt verifiziert).
