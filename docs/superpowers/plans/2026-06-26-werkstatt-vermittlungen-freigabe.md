# Werkstatt „Meine Vermittlungen" + Reparaturfreigabe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Werkstatt sieht im Portal ihre KVA-Vermittlungen mit Funnel-Status; Admin/KB setzt in der Fallakte manuell „Reparatur freigegeben", was die Werkstatt als Status sieht.

**Architecture:** Leak-safe `SECURITY DEFINER`-RPC `get_werkstatt_vermittlungen()` (self-scoped via auth.uid(), nur kuratierte Spalten) → Werkstatt-Seite. Freigabe = `claims.reparatur_freigegeben_am` (+ `_von`), gesetzt durch admin/dispatch-gated Server-Action + Button in der Fallakte (`WerkstattKvaSection`).

**Tech Stack:** Supabase (Postgres, plpgsql/sql function via Plugin), Next.js Server Components + Server Actions, React, vitest, `@/components/shared/DataTable` + `primitives`.

## Global Constraints

- DDL nur via Supabase-Plugin; Migration-File == getrackte Version (Twin-Drift). `get_advisors` danach.
- Funktion: `SET search_path = public`, `REVOKE FROM PUBLIC, anon`, `GRANT TO authenticated`, self-scoped via `auth.uid()` (Security-Lehre Staffelung).
- Metrik/Status: gezählt = settled/funnel; `reparatur_freigegeben` > `storniert` (lead disqualifiziert/kalt) > `beauftragt` (claim existiert) > `eingegangen`.
- Sichtbar: Name + Fahrzeug/Kennzeichen + KVA-Betrag + Datum + Status + Freigabe. **Kein** Telefon/E-Mail.
- UI Deutsch mit Umlauten; Component-Set (`DataTable`/`SectionCard`/`Button`); Token-Audit (`success`/`info`/`danger`-Tokens, kein raw hex/scale).
- Server-Actions Result-Object; kein `type`/`const`-Export aus `'use server'` (AAR-664).
- Base `staging`, PR gegen `staging`. 7-Punkte-Audit. Fallakte = HOT → additiv.

---

### Task 1: DB — claims-Freigabe-Spalten + `get_werkstatt_vermittlungen()`

**Vorgehen:** `apply_migration({ name: 'werkstatt_vermittlungen_freigabe', query: <DDL> })` → `list_migrations` → File `supabase/migrations/<V>_werkstatt_vermittlungen_freigabe.sql` (== Version) committen → `get_advisors({type:'security'})` → `execute_sql` Smoke.

- [ ] **Step 1: DDL anwenden**

```sql
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS reparatur_freigegeben_am timestamptz,
  ADD COLUMN IF NOT EXISTS reparatur_freigegeben_von uuid;

CREATE OR REPLACE FUNCTION public.get_werkstatt_vermittlungen()
RETURNS TABLE (
  lead_id uuid, claim_id uuid, kunde_name text, fahrzeug text, kennzeichen text,
  kva_betrag numeric, erstellt_am timestamptz, status text, reparatur_freigegeben_am timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    l.id AS lead_id,
    c.id AS claim_id,
    NULLIF(btrim(concat_ws(' ', l.vorname, l.nachname)), '') AS kunde_name,
    NULLIF(btrim(concat_ws(' ', l.fahrzeug_hersteller, l.fahrzeug_modell,
      CASE WHEN l.fahrzeug_baujahr IS NOT NULL THEN '(' || l.fahrzeug_baujahr || ')' END)), '') AS fahrzeug,
    l.kennzeichen,
    COALESCE(l.kostenvoranschlag_brutto, l.kostenvoranschlag_netto) AS kva_betrag,
    l.created_at AS erstellt_am,
    CASE
      WHEN c.reparatur_freigegeben_am IS NOT NULL THEN 'reparatur_freigegeben'
      WHEN l.status IN ('disqualifiziert','kalt') THEN 'storniert'
      WHEN c.id IS NOT NULL THEN 'beauftragt'
      ELSE 'eingegangen'
    END AS status,
    c.reparatur_freigegeben_am
  FROM public.leads l
  LEFT JOIN public.claims c ON c.lead_id = l.id
  WHERE l.werkstatt_id = (SELECT w.id FROM public.werkstaetten w WHERE w.user_id = auth.uid())
  ORDER BY l.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_werkstatt_vermittlungen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_werkstatt_vermittlungen() TO authenticated;
```
*(auth.uid() in einer SECURITY-DEFINER-Funktion = der CALLER, nicht der Definer → self-scoping greift. Kein Workshop → Subquery NULL → 0 Zeilen.)*

- [ ] **Step 2:** `list_migrations` → Version `<V>` → File committen (== Version).
- [ ] **Step 3:** `get_advisors({type:'security'})` → keine neuen Lints auf `claims`/`get_werkstatt_vermittlungen` (insb. KEIN `anon_security_definer_function_executable`).
- [ ] **Step 4 (Smoke, execute_sql READ):**
```sql
SELECT proname, pg_get_function_identity_arguments(oid), proacl::text
  FROM pg_proc WHERE proname='get_werkstatt_vermittlungen';
-- proacl darf nur {postgres, authenticated} enthalten, NICHT anon.
SELECT count(*) FROM information_schema.columns
 WHERE table_name='claims' AND column_name IN ('reparatur_freigegeben_am','reparatur_freigegeben_von'); -- = 2
```
- [ ] **Step 5: Commit** (Migration-File, Audit-Body).

---

### Task 2: TypeScript-Typen (surgisch)

**Files:** Modify `src/lib/supabase/database.types.ts`

- [ ] **Step 1:** In `claims` Row/Insert/Update (alphabetisch) ergänzen: `reparatur_freigegeben_am: string | null` (Row) / `?: string | null` (Insert/Update); `reparatur_freigegeben_von: string | null` analog. *(Die RPC-Funktion wird NICHT in die Types generiert — der Query-Helper tippt die Row-Form manuell, s. Task 3.)*
- [ ] **Step 2:** `npx tsc --noEmit` → unsere Files 0 Fehler. **Step 3: Commit.**

---

### Task 3: Query-Helper `getWerkstattVermittlungen`

**Files:** Modify `src/lib/werkstatt/queries.ts`

**Interfaces — Produces:** `WerkstattVermittlung` type + `getWerkstattVermittlungen(): Promise<WerkstattVermittlung[]>`

- [ ] **Step 1:** Anhängen:

```typescript
export type WerkstattVermittlungStatus = 'eingegangen' | 'beauftragt' | 'reparatur_freigegeben' | 'storniert'

export type WerkstattVermittlung = {
  lead_id: string
  claim_id: string | null
  kunde_name: string | null
  fahrzeug: string | null
  kennzeichen: string | null
  kva_betrag: number | null
  erstellt_am: string
  status: WerkstattVermittlungStatus
  reparatur_freigegeben_am: string | null
}

/** Leak-safe: ruft die self-scoped SECURITY-DEFINER-RPC (nur kuratierte Spalten, keine PII-Kontaktdaten). */
export async function getWerkstattVermittlungen(): Promise<WerkstattVermittlung[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_werkstatt_vermittlungen')
  if (error) { console.error('[werkstatt] get_werkstatt_vermittlungen:', error.message); return [] }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    lead_id: r.lead_id as string,
    claim_id: (r.claim_id as string | null) ?? null,
    kunde_name: (r.kunde_name as string | null) ?? null,
    fahrzeug: (r.fahrzeug as string | null) ?? null,
    kennzeichen: (r.kennzeichen as string | null) ?? null,
    kva_betrag: r.kva_betrag != null ? Number(r.kva_betrag) : null,
    erstellt_am: r.erstellt_am as string,
    status: (r.status as WerkstattVermittlungStatus) ?? 'eingegangen',
    reparatur_freigegeben_am: (r.reparatur_freigegeben_am as string | null) ?? null,
  }))
}
```
*(Falls `supabase.rpc('get_werkstatt_vermittlungen')` tsc-seitig die Funktion nicht kennt (nicht in den generierten Types): `supabase.rpc('get_werkstatt_vermittlungen' as never)` casten — die Funktion ist in der DB live.)*

- [ ] **Step 2:** `npx tsc --noEmit`. **Step 3: Commit.**

---

### Task 4: Pure Status-Helper + Test

**Files:** Create `src/lib/werkstatt/vermittlung-status.ts`, Test `src/lib/werkstatt/__tests__/vermittlung-status.test.ts`

**Interfaces — Produces:** `vermittlungStatusBadge(status): { label: string; className: string }`

- [ ] **Step 1: Test:**

```typescript
import { describe, it, expect } from 'vitest'
import { vermittlungStatusBadge } from '../vermittlung-status'

describe('vermittlungStatusBadge', () => {
  it('mappt alle 4 Status auf Label + Badge-Klasse', () => {
    expect(vermittlungStatusBadge('eingegangen').label).toBe('Eingegangen')
    expect(vermittlungStatusBadge('beauftragt').label).toBe('Beauftragt')
    expect(vermittlungStatusBadge('reparatur_freigegeben').label).toBe('Reparatur freigegeben')
    expect(vermittlungStatusBadge('storniert').label).toBe('Storniert')
  })
  it('freigegeben nutzt success-Token, storniert danger', () => {
    expect(vermittlungStatusBadge('reparatur_freigegeben').className).toContain('success')
    expect(vermittlungStatusBadge('storniert').className).toContain('danger')
  })
  it('unbekannt faellt auf eingegangen-Stil zurueck', () => {
    expect(vermittlungStatusBadge('xxx' as never).label).toBe('Eingegangen')
  })
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement:**

```typescript
import type { WerkstattVermittlungStatus } from './queries'

const MAP: Record<WerkstattVermittlungStatus, { label: string; className: string }> = {
  eingegangen:          { label: 'Eingegangen',          className: 'bg-claimondo-bg text-claimondo-ondo border border-claimondo-border' },
  beauftragt:           { label: 'Beauftragt',           className: 'bg-info-soft text-info-strong border border-info/20' },
  reparatur_freigegeben:{ label: 'Reparatur freigegeben', className: 'bg-success-soft text-success-strong border border-success/20' },
  storniert:            { label: 'Storniert',            className: 'bg-danger-soft text-danger-strong border border-danger/20' },
}

export function vermittlungStatusBadge(status: WerkstattVermittlungStatus): { label: string; className: string } {
  return MAP[status] ?? MAP.eingegangen
}
```
*(Importiert nur den Type aus queries.ts — kein 'use server'-Export-Problem, queries.ts ist kein 'use server'-File.)*

- [ ] **Step 4:** Run → 3 passed. **Step 5: Commit.**

---

### Task 5: Werkstatt-Portal — Seite + Nav

**Files:** Create `src/app/werkstatt/(shell)/vermittlungen/page.tsx`, Create `src/components/werkstatt/WerkstattVermittlungen.tsx`, Modify `src/components/werkstatt/WerkstattShell.tsx`

- [ ] **Step 1: Nav** (`WerkstattShell.tsx`): Import `HandshakeIcon` (lucide); in `WERKSTATT_NAV_ITEMS` nach „Kostenvoranschlag" einfügen: `{ href: '/werkstatt/vermittlungen', label: 'Meine Vermittlungen', icon: HandshakeIcon }`; `WERKSTATT_MOBILE_ITEMS = WERKSTATT_NAV_ITEMS` (alle 5 mobil).
- [ ] **Step 2: Seite** (`vermittlungen/page.tsx`):

```tsx
import { redirect } from 'next/navigation'
import { getWerkstattByUserId, getWerkstattVermittlungen } from '@/lib/werkstatt/queries'
import { WerkstattVermittlungen } from '@/components/werkstatt/WerkstattVermittlungen'

export const dynamic = 'force-dynamic'

export default async function WerkstattVermittlungenPage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')
  const vermittlungen = await getWerkstattVermittlungen()
  return <WerkstattVermittlungen vermittlungen={vermittlungen} werkstattName={werkstatt.name} />
}
```

- [ ] **Step 3: Komponente** (`WerkstattVermittlungen.tsx`, Client): Header + `DataTableContainer`/`Table` mit Spalten Kunde · Fahrzeug+Kennzeichen · KVA-Betrag (EUR de-DE) · Eingegangen (Datum de-DE) · Status (`<span className={vermittlungStatusBadge(v.status).className}>{...label}</span>`). EmptyState wenn leer („Noch keine Vermittlungen."). Reihen `key={v.lead_id}`. Token-konform, Umlaute.
- [ ] **Step 4:** `npx tsc --noEmit`. **Step 5: Commit.**

---

### Task 6: Freigabe-Server-Action + Test

**Files:** Create `src/app/faelle/[id]/_actions/reparatur-freigabe.ts`, Test `src/app/faelle/[id]/_actions/__tests__/reparatur-freigabe.test.ts`

**Interfaces — Produces:** `reparaturFreigeben(claimId)` + `reparaturFreigabeZuruecknehmen(claimId)` → `{ ok: boolean; error?: string }`

- [ ] **Step 1: Action:**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const STAFF = ['admin', 'dispatch', 'kundenbetreuer']

async function requireStaff(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  return p && STAFF.includes(p.rolle as string) ? { id: user.id } : null
}

export async function reparaturFreigeben(claimId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff()
  if (!staff) return { ok: false, error: 'Keine Berechtigung.' }
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }
  const supabase = await createClient()
  const { error } = await supabase.from('claims')
    .update({ reparatur_freigegeben_am: new Date().toISOString(), reparatur_freigegeben_von: staff.id })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/faelle/${claimId}`)
  return { ok: true }
}

export async function reparaturFreigabeZuruecknehmen(claimId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff()
  if (!staff) return { ok: false, error: 'Keine Berechtigung.' }
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }
  const supabase = await createClient()
  const { error } = await supabase.from('claims')
    .update({ reparatur_freigegeben_am: null, reparatur_freigegeben_von: null })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/faelle/${claimId}`)
  return { ok: true }
}
```
*(`.eq('id', claimId)` + claims-RLS `claims_staff_all_consolidated` (admin/KB) — admin/KB-Update greift via RLS; der requireStaff-Gate ist die Pre-Condition. revalidatePath nutzt claimId als Pfad-Segment — die Fallakte-Route ist `/faelle/[id]` mit id=claim/fall-id.)*

- [ ] **Step 2: Test** (Mock-Setup wie `admin/werkstaetten/__tests__/actions.test.ts`): non-staff (rolle `kunde`) → `ok:false`; staff (`admin`) + claims-update ok → `ok:true`. (mock `@/lib/supabase/server` createClient: auth.getUser + profiles.single + claims.update().eq() → {error:null}; `next/cache` revalidatePath no-op.)
- [ ] **Step 3:** `npx vitest run …/reparatur-freigabe.test.ts` → grün. **Step 4: Commit.**

---

### Task 7: Freigabe-Button in der Fallakte (`WerkstattKvaSection`)

**Files:** Modify `src/app/faelle/[id]/_stammdaten/WerkstattKvaSection.tsx`, Modify `src/app/faelle/[id]/page.tsx` (claim SELECT)

- [ ] **Step 1: claim SELECT erweitern** (`page.tsx:91`): `werkstatt_id, reparatur_freigegeben_am` an die `.select('status, work_state, …, kostenvoranschlag_brutto')` anhängen; im claim-Mapping-Objekt (ab :100/:123) `werkstatt_id` + `reparatur_freigegeben_am` mit aufnehmen (`claimRow.werkstatt_id ?? null` etc.). Type-Block (:100-101) um beide Felder erweitern.
- [ ] **Step 2: `WerkstattKvaSection` erweitern** — Render-Bedingung von „betrag != null" auf „werkstatt-referred ODER betrag" lockern + Freigabe-Block (nur admin/KB) ergänzen:

```tsx
'use client'

import { useState } from 'react'
import { WrenchIcon, CheckCircle2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { useFall } from '../FallContext'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { reparaturFreigeben, reparaturFreigabeZuruecknehmen } from '../_actions/reparatur-freigabe'

const kvaFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function WerkstattKvaSection() {
  const { claim, userRolle, refreshFall } = useFall()
  const [saving, setSaving] = useState(false)

  const rec = claim as Record<string, unknown> | null
  const werkstattId = rec?.werkstatt_id as string | null
  const brutto = rec?.kostenvoranschlag_brutto as number | null
  const netto  = rec?.kostenvoranschlag_netto  as number | null
  const betrag = brutto ?? netto
  const claimId = rec?.id as string | undefined
  const freigegebenAm = rec?.reparatur_freigegeben_am as string | null

  // Nur fuer werkstatt-vermittelte Faelle (oder wenn ein KVA-Betrag vorliegt)
  if (!werkstattId && betrag == null) return null

  const istStaff = userRolle === 'admin' || userRolle === 'kundenbetreuer'

  async function setFreigabe(frei: boolean) {
    if (!claimId) return
    setSaving(true)
    try {
      const res = frei ? await reparaturFreigeben(claimId) : await reparaturFreigabeZuruecknehmen(claimId)
      if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
      toast.success(frei ? 'Reparatur freigegeben.' : 'Freigabe zurückgenommen.')
      refreshFall()
    } finally { setSaving(false) }
  }

  return (
    <SectionCard icon={<WrenchIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Werkstatt-Vermittlung" hint="getrennte Spur vom SV-Gutachten">
      {betrag != null && (
        <div className="flex items-baseline gap-2">
          <span className="text-body font-semibold text-claimondo-navy">{kvaFormat.format(betrag)}</span>
          {brutto == null && netto != null && <span className="text-caption text-claimondo-ondo/70">(Netto)</span>}
          <span className="text-caption text-claimondo-ondo/70">Werkstatt-KVA</span>
        </div>
      )}

      <div className="mt-3 border-t border-claimondo-border pt-3">
        {freigegebenAm ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-body-sm font-medium text-success-strong">
              <CheckCircle2Icon className="w-4 h-4" /> Reparatur freigegeben
            </span>
            {istStaff && (
              <Button variant="ghost" size="sm" loading={saving} onClick={() => setFreigabe(false)}>Zurücknehmen</Button>
            )}
          </div>
        ) : istStaff ? (
          <Button variant="navy" size="sm" loading={saving} onClick={() => setFreigabe(true)} iconLeft={<CheckCircle2Icon className="w-4 h-4" />}>
            Reparatur freigeben
          </Button>
        ) : (
          <span className="text-caption text-claimondo-ondo/70">Reparatur noch nicht freigegeben.</span>
        )}
      </div>
    </SectionCard>
  )
}
```

- [ ] **Step 3:** `npx tsc --noEmit`. **Step 4: Commit.**

---

### Task 8: Gates + Audit + PR

- [ ] **Step 1:** `npx vitest run src/lib/werkstatt src/app/faelle src/app/admin/werkstaetten` (neue + Nachbar-Tests grün).
- [ ] **Step 2:** `npm install` (Worktree-Deps) dann `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (Server-Actions + Routen + Fallakte → Next.js-Validator).
- [ ] **Step 3:** `npm run check:token-audit` · `check:component-set -- --ratchet` · `check:knip -- --ratchet` → 0 neue.
- [ ] **Step 4:** DB-Smoke (transactional, RAISE-Rollback wie Staffelung): `get_werkstatt_vermittlungen` liefert pro Lead den korrekten `status` + reparatur_freigegeben_am-Pfad; self-scoping (kein-Workshop-User → 0 Zeilen). 7-Punkte-Audit, push, PR gegen `staging`.

## Self-Review (gegen Spec)

1. **Spec coverage:** RPC-Lesepfad (T1/T3) ✓, 4-Status-Mapping (T1 CASE + T4 Badge) ✓, claims-Freigabe-Spalten + Action + Button (T1/T6/T7) ✓, Werkstatt-Seite+Nav (T5) ✓, leak-safe (nur kuratierte Spalten, kein Kontakt) ✓, Security (revoke anon/grant authenticated/self-scoped) ✓.
2. **Placeholder scan:** Code-Blöcke vollständig; „falls rpc-Type fehlt → as never" ist konkrete Anweisung, kein Placeholder.
3. **Type consistency:** `WerkstattVermittlungStatus` (4 Werte) identisch in queries.ts (T3) + vermittlung-status.ts (T4) + DB-CASE (T1). `reparaturFreigeben(claimId)`/`reparaturFreigabeZuruecknehmen(claimId)` identisch T6-def + T7-call. `get_werkstatt_vermittlungen` Name identisch T1-DDL + T3-rpc.
