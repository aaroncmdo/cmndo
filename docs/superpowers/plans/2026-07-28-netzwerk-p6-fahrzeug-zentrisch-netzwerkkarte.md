# Netzwerk-Ökosystem P6 — Kunde fahrzeug-zentrisch (H) + Netzwerkkarte (E) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Kunde-Portal fahrzeug-zentrisch machen (`/kunde/fahrzeuge` → Fahrzeug-Detail mit Schadenhistorie → Schaden-Detail, das FM-Muster owner-scoped generalisiert) **und** die Schadenkarte als „Netzwerkkarte" umframen (Wording, ON-DELETE-Zombie-Fix, token-basierter Scan setzt `claims.netzwerk_owner_id` = Karten-Issuer).

**Architecture:** Reuse-first. WS H spiegelt das bestehende Flottenmanager-Fahrzeug-Muster (`/flotte/(shell)/fahrzeug/[id]`, `getFahrzeugSchaeden`, `getFlottenClaimView`), aber owner-scoped über `vehicles.current_owner_id` statt firma-scoped über `flotten_fahrzeuge.firma_id`. Die Schaden-Detail-Sicht wird **nicht neu gebaut** — sie konsumiert `getClaimDetail('kunde')` / `KundeClaimView` (Claims-Programm, C4). Der `vehicles.current_owner_id`-Writer + Backfill schließen die Datenlücke (0/14 befüllt). WS E ist reiner Rebrand + ein additiver BEFORE-DELETE-Trigger + ein Attributions-Write im Scan-Pfad — die Schadenkarte-Infra (`generateSchadenkarteToken`, `schadenkarten.karten_token`, `mintSchadenkarten`, `merge_stub_vehicle`) bleibt unverändert.

**Tech Stack:** Next.js 15 (App-Router, Server-Components, `force-dynamic`), TypeScript + `@supabase/supabase-js` (Admin-Client, `createAdminClient`), Supabase Postgres (DDL **nur** via MCP-Plugin `apply_migration`), vitest, Tailwind v4 + `@/components/shared/*` + `@/components/primitives/*`.

## Global Constraints

- **DDL NUR via Supabase-Plugin `apply_migration`** (AGENTS.md Regel 2). Ablauf je Migration: apply → `list_migrations` (getrackte Version `<V>` ablesen) → File committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == getrackte Version, Twin-Drift vermeiden) → `execute_sql` (READ) verifizieren → Typen regenerieren + committen (`src/lib/supabase/database.types.ts`). **`execute_sql` nur READ**, nie DDL/Daten-Writes.
- **Nie auf `main` pushen** (Regel 1). Branch `kitta/aar-<nr>-netzwerk-p6-fahrzeug-netzwerkkarte`, PR gegen `staging`, nicht selbst mergen.
- **Kein unbegleiteter Stash am Session-Ende** (Regel 3). **Prod-Playwright-Smoke nach Deploy** (Regel 4) — Flow-Liste in der DoD.
- **prod-Ref = `paizkjajbuxxksdoycev`** (teilt DB mit staging + LIVE-Stripe). Verifikation via `execute_sql` READ-only. Kein destruktiver Prod-Write; Smokes nur über Test-/Wegwerf-Konten (`telefon = NULL`).
- **Frontend-Umlaute Pflicht** (AGENTS.md): alle nutzersichtbaren Strings mit echten `ä/ö/ü/ß` (`Übersicht`, `Fälle`, `Schäden`). Backend/Comments frei.
- **Komponenten-Set** (verbindlich): Cards = `@/components/shared/SectionCard`, `EmptyState`, `StatusBadge`; kein handgerolltes Button/Card-Markup. Status-Farben nur über die Registry (`StatusBadge domain="claims-status"`), nie inline-Maps.
- **Design-Tokens:** `text-claimondo-navy/-shield/-border`, `rounded-ios-*`, `text-body-*` — nie Tailwind-Default-Radien/Hex/Status-Scales (Token-Audit-Ratchet).
- **Server-Actions liefern `{ ok: boolean; error?: string }`** (kein `throw`); Non-Critical-Sub-Ops (Notifs) in lokalem try/catch; `revalidatePath` bei jedem Write.
- **Loader (kein `'use server'`) liefern `null`/leere Arrays statt throw** (fahrzeug-schaeden-Konvention) — kein Result-Object.
- **`createAdminClient()` ist UNGETYPT** → Select-Strings gegen prod proben (`execute_sql` READ), nicht raten. `schadenkarten`/`vehicles`-Reads via `AnyDb`-Cast (schadenkarten noch nicht voll in `database.types`).
- **Owner-scoped (Kunde) ≠ firma-scoped (FM)** — kein Param-Swap: FM gated `flotten_fahrzeuge.firma_id`, Kunde gated `vehicles.current_owner_id`. Verschiedene Dimensionen (K8).
- **Ratchets 0-neu:** `check:flag-drift`, `check:token-audit`, `check:component-set`, `check:knip`, `check:redirect-stubs`, `check:status-registry`, `check:rls-policies`, `check:rls-grants`. Neue Enums MÜSSEN vor jedem Code-Write in CHECK + Snapshot (dieser Plan braucht **keine** neuen Enums — WS E reused `'frei'`).
- **Pflichtlektüre vor Start:** `docs/superpowers/specs/2026-07-27-{netzwerk-oekosystem-epic-overview-design, implementierungs-roadmap-phasen, hardening-und-koordination-vor-plaenen}.md` (§2b WS H+E, P6, K8/K9) + der P0-Plan `docs/superpowers/plans/2026-07-28-netzwerk-p0-fundament.md` (Namens-/Konventions-Konsistenz).

## Koordinations-Gates (blockieren den MERGE, nicht das Schreiben von Tests/Code)

- **⚠ P0-Fundament (`netzwerk-p0-fundament`)** — **hard-blockt Task 10**: `claims.netzwerk_owner_id` **existiert heute NICHT** (fresh verifiziert: 0 Spalten auf `claims`/`profiles`, 28.07.). Task 10 (Scan→Attribution) schreibt genau diese Spalte → **erst baubar/mergebar nach P0-T3-Merge**. Tasks 1–9 sind P0-unabhängig (`vehicles.current_owner_id` existiert bereits — CMM-50-Spalte, nicht P0).
- **⚠ C-Migration (C4 · Claims-Programm `a6c863e2` / `470d55c9`)** — Task 7 **konsumiert** `getClaimDetail('kunde')` (`src/lib/claims/detail/get-claim-detail.ts`) + `getKundeClaimView` (`src/lib/claims/kunde-claim-view.ts`) + `<KundeClaimView>`. **NICHT forken, NICHT neu bauen.** Beide sind heute im Branch gemergt; falls die C-Pakete die Signatur ändern → nach deren Merge rebasen, Consumer anpassen. **Keine** DDL auf `claims` in diesem Plan außer Task 10 (das die additive P0-Spalte *schreibt*, nicht anlegt).
- **⚠ Schadenkarte-Lane (`63fe43f9`, `kitta/admin-karten-erklaertext-fmbind`)** — hohe Churn auf `schadenkarte.ts`/`nfc.ts`/`/flotte/(shell)/fahrzeug/[id]/page.tsx` + `NfcKarteSchreibenButton`. Dieser Plan fasst diese Files **additiv** an: Task 2 exportiert einen neuen Helper aus `flotte/fahrzeug-schaeden.ts`, Task 8 ändert nur User-Strings (kein Verhalten), Task 9 ist eine neue Migration. **Vor Anfassen syncen, nach deren Merge rebasen.**
- **⚠ FM-Fahrzeug-Lane** — `getFahrzeugSchaeden`/`FahrzeugSchaedenSection` werden **additiv** parametrisiert (optionaler Prop / neuer Export, FM-Default unverändert). Verhaltens-identisch → kein FM-Regressionsrisiko, aber Rebase-Koordination.

---

## Task 0: Worktree + Ist-Erhebung (kein Merge-Deliverable)

**Files:** keine (Verifikation).

- [ ] **Schritt 1:** Frischen Worktree off staging: `node scripts/new-session-worktree.mjs aar-<nr>-netzwerk-p6-fahrzeug-netzwerkkarte staging`; `git log -1 origin/staging` == HEAD verifizieren.
- [ ] **Schritt 2:** Datenbasis-Anker frisch gegen prod (`execute_sql` READ, Ref `paizkjajbuxxksdoycev`) — bestätigt K8/K9 vor Baubeginn:
```sql
select
  (select count(*) from vehicles)                                          as veh_total,        -- erwartet 14
  (select count(current_owner_id) from vehicles)                           as veh_owner_filled, -- erwartet 0  (K8)
  (select count(*) from claims where vehicle_id is not null)               as claims_with_veh,  -- erwartet ~7  (K8)
  (select count(*) from schadenkarten where nfc_uid is not null)           as nfc_count,        -- erwartet 0  (K9)
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='claims'
       and column_name='netzwerk_owner_id')                                as claims_owner_col; -- 0 = P0 offen → Task 10 blockiert
```
- [ ] **Schritt 3:** ON-DELETE-Verhalten der Karten-FK + Status-CHECK bestätigen (Task 9 hängt daran):
```sql
select con.conname, con.confdeltype,                                        -- erwartet 'n' (SET NULL) = Zombie-Bug (K9)
       pg_get_constraintdef(chk.oid)                                        -- erwartet ...'bestellt','frei','gebunden','gesperrt','ersetzt'...
from pg_constraint con
join pg_constraint chk on chk.conrelid=con.conrelid and chk.contype='c'
where con.conrelid='public.schadenkarten'::regclass and con.contype='f'
  and con.conname='schadenkarten_fahrzeug_id_fkey';
```
- [ ] **Schritt 4:** Identitäts-/Issuer-Mapping bestätigen (Task 10): `firmen_flotten_konten` trägt `firma_id`+`user_id`:
```sql
select string_agg(column_name, ',' order by column_name) from information_schema.columns
  where table_schema='public' and table_name='firmen_flotten_konten' and column_name in ('firma_id','user_id');
-- erwartet: firma_id,user_id
```
Abweichung bei irgendeinem Anker → STOP, Marker `[[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]]` abgleichen (andere Lane war schneller).

---

## Task 1: Owner-scoped Fahrzeug-Loader `getKundeFahrzeuge`

**Files:**
- Create: `src/lib/kunde/fahrzeuge.ts`
- Test: `src/lib/kunde/__tests__/fahrzeuge.test.ts`

**Interfaces:**
- Produces: `type KundeFahrzeug = { vehicleId, kennzeichen, hersteller, modell, farbe, kilometerstand, fin }`; `getKundeFahrzeuge(db: AnyDb, userId: string): Promise<KundeFahrzeug[]>` — owner-scoped auf `vehicles.current_owner_id`. Konsumiert von Task 5.

- [ ] **Schritt 1: Failing Test schreiben**
```ts
// src/lib/kunde/__tests__/fahrzeuge.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getKundeFahrzeuge } from '../fahrzeuge'

function mockDb(rows: unknown[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null })
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { from, _spies: { from, select, eq, order } } as never
}

describe('getKundeFahrzeuge', () => {
  it('filtert owner-scoped auf current_owner_id und mappt die Spalten', async () => {
    const db = mockDb([
      { id: 'v1', kennzeichen_aktuell: 'B-AB 123', hersteller: 'BMW', modell_haupttyp: '320i',
        farbe_klartext: 'schwarz', aktueller_kilometerstand: 42000, fin: 'WBА…' },
    ])
    const out = await getKundeFahrzeuge(db, 'user-1')
    expect((db as unknown as { _spies: { from: ReturnType<typeof vi.fn> } })._spies.from).toHaveBeenCalledWith('vehicles')
    expect((db as unknown as { _spies: { eq: ReturnType<typeof vi.fn> } })._spies.eq).toHaveBeenCalledWith('current_owner_id', 'user-1')
    expect(out).toEqual([
      { vehicleId: 'v1', kennzeichen: 'B-AB 123', hersteller: 'BMW', modell: '320i',
        farbe: 'schwarz', kilometerstand: 42000, fin: 'WBА…' },
    ])
  })
  it('gibt [] bei DB-Fehler zurück (kein throw)', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const db = { from: () => ({ select: () => ({ eq: () => ({ order }) }) }) } as never
    expect(await getKundeFahrzeuge(db, 'user-1')).toEqual([])
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/kunde/__tests__/fahrzeuge.test.ts` → FAIL („getKundeFahrzeuge is not a function").

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/kunde/fahrzeuge.ts
// Owner-scoped Fahrzeug-Loader fuers Kunde-Portal (WS H). Spiegelt das FM-Muster
// (getKundeFlotte), aber gated auf vehicles.current_owner_id statt flotten_fahrzeuge.firma_id.
// Pure loader — kein throw, kein revalidatePath (read-only).
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export type KundeFahrzeug = {
  vehicleId: string
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  farbe: string | null
  kilometerstand: number | null
  fin: string | null
}

/** Alle Fahrzeuge, deren aktueller Halter dieser Kunde ist (owner-scoped). */
export async function getKundeFahrzeuge(db: AnyDb, userId: string): Promise<KundeFahrzeug[]> {
  const { data, error } = await db
    .from('vehicles')
    .select('id,kennzeichen_aktuell,hersteller,modell_haupttyp,farbe_klartext,aktueller_kilometerstand,fin')
    .eq('current_owner_id', userId)
    .order('kennzeichen_aktuell', { ascending: true })
  if (error) {
    console.error('[getKundeFahrzeuge] query error:', error.message)
    return []
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    vehicleId: r.id as string,
    kennzeichen: (r.kennzeichen_aktuell as string | null) ?? null,
    hersteller: (r.hersteller as string | null) ?? null,
    modell: (r.modell_haupttyp as string | null) ?? null,
    farbe: (r.farbe_klartext as string | null) ?? null,
    kilometerstand: (r.aktueller_kilometerstand as number | null) ?? null,
    fin: (r.fin as string | null) ?? null,
  }))
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/kunde/__tests__/fahrzeuge.test.ts` → PASS.

- [ ] **Schritt 5: Commit**
```bash
git add src/lib/kunde/fahrzeuge.ts src/lib/kunde/__tests__/fahrzeuge.test.ts
git commit -m "feat(netzwerk): owner-scoped getKundeFahrzeuge loader (P6 T1)"
```

---

## Task 2: Owner-scoped Schaden-Loader `getKundeFahrzeugSchaeden` (FM-Kern additiv extrahiert)

**⚠ Koordination:** berührt `src/lib/flotte/fahrzeug-schaeden.ts` (63fe43f9/FM-Lane) — **additiv** (neuer Export + verhaltens-identischer interner Refactor).

**Files:**
- Modify: `src/lib/flotte/fahrzeug-schaeden.ts` (Schaden-Query in exportierten Helper `ladeSchaedenFuerFahrzeug` extrahieren; `getFahrzeugSchaeden` ruft ihn nach dem firma-Gate)
- Create: `src/lib/kunde/fahrzeug-schaeden.ts`
- Test: `src/lib/kunde/__tests__/fahrzeug-schaeden.test.ts`

**Interfaces:**
- Consumes: `FahrzeugSchaeden`, `ClaimMini`, `DraftMini`, `DRAFT_STATUSES` (bestehend, `flotte/fahrzeug-schaeden.ts`).
- Produces: `ladeSchaedenFuerFahrzeug(db, vehicleId): Promise<FahrzeugSchaeden>` (gate-frei, Claims+Drafts by vehicle_id); `getKundeFahrzeugSchaeden(db, userId, vehicleId): Promise<FahrzeugSchaeden>` (owner-Gate + Kern). Konsumiert von Task 6.

- [ ] **Schritt 1: Failing Test schreiben**
```ts
// src/lib/kunde/__tests__/fahrzeug-schaeden.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getKundeFahrzeugSchaeden } from '../fahrzeug-schaeden'

/** vehicles-Gate maybeSingle → dann claims.order → dann leads.order. */
function mockDb(opts: { owned: boolean; claims: unknown[]; drafts: unknown[] }) {
  const from = vi.fn((table: string) => {
    if (table === 'vehicles') {
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle:
        () => Promise.resolve({ data: opts.owned ? { id: 'v1' } : null, error: null }) }) }) }) }
    }
    if (table === 'claims') {
      return { select: () => ({ eq: () => ({ order:
        () => Promise.resolve({ data: opts.claims, error: null }) }) }) }
    }
    // leads
    return { select: () => ({ eq: () => ({ in: () => ({ order:
      () => Promise.resolve({ data: opts.drafts, error: null }) }) }) }) }
  })
  return { from } as never
}

describe('getKundeFahrzeugSchaeden', () => {
  it('gibt {claims:[],drafts:[]} zurück wenn das Fahrzeug NICHT dem Kunden gehört (kein Leak)', async () => {
    const out = await getKundeFahrzeugSchaeden(mockDb({ owned: false, claims: [{ id: 'c1' }], drafts: [] }), 'u1', 'v1')
    expect(out).toEqual({ claims: [], drafts: [] })
  })
  it('lädt Claims (operative_status→status) + Drafts wenn owner passt', async () => {
    const out = await getKundeFahrzeugSchaeden(mockDb({
      owned: true,
      claims: [{ id: 'c1', claim_nummer: 'K-1', operative_status: 'gutachten-eingegangen',
        schadentag: '2026-07-01', schadens_hoehe_netto: 1000, created_at: '2026-07-02' }],
      drafts: [{ id: 'l1', status: 'neu', created_at: '2026-07-03' }],
    }), 'u1', 'v1')
    expect(out.claims[0]).toMatchObject({ claimId: 'c1', claimNummer: 'K-1', status: 'gutachten-eingegangen' })
    expect(out.drafts[0]).toMatchObject({ leadId: 'l1', status: 'neu' })
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/kunde/__tests__/fahrzeug-schaeden.test.ts` → FAIL.

- [ ] **Schritt 3a: `flotte/fahrzeug-schaeden.ts` additiv extrahieren** — den Claims-+Drafts-Block aus `getFahrzeugSchaeden` in einen neuen Export ziehen; die firma-gegatete Funktion ruft ihn danach (verhaltens-identisch):
```ts
// src/lib/flotte/fahrzeug-schaeden.ts  — NEUER Export (unter DRAFT_STATUSES einfügen):

/** Claims + Draft-Leads eines Fahrzeugs — OHNE Ownership-Gate (der Caller gated vorher:
 *  FM via flotten_fahrzeuge.firma_id, Kunde via vehicles.current_owner_id). Pure loader. */
export async function ladeSchaedenFuerFahrzeug(db: AnyDb, vehicleId: string): Promise<FahrzeugSchaeden> {
  const { data: claimsRaw, error: claimsError } = await db
    .from('claims')
    .select('id,claim_nummer,operative_status,schadentag,schadens_hoehe_netto,created_at')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })
  if (claimsError) console.error('[fahrzeug-schaeden] claims query error:', claimsError.message)
  const claims: ClaimMini[] = ((claimsError ? [] : (claimsRaw ?? [])) as Array<Record<string, unknown>>).map((row) => ({
    claimId: row.id as string,
    claimNummer: (row.claim_nummer as string | null) ?? null,
    status: (row.operative_status as string | null) ?? null,
    schadentag: (row.schadentag as string | null) ?? null,
    schadensHoeheNetto: (row.schadens_hoehe_netto as number | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
  }))

  const { data: leadsRaw, error: leadsError } = await db
    .from('leads')
    .select('id,status,created_at')
    .eq('vehicle_id', vehicleId)
    .in('status', DRAFT_STATUSES)
    .order('created_at', { ascending: false })
  if (leadsError) console.error('[fahrzeug-schaeden] leads query error:', leadsError.message)
  const drafts: DraftMini[] = ((leadsError ? [] : (leadsRaw ?? [])) as Array<Record<string, unknown>>).map((row) => ({
    leadId: row.id as string,
    status: (row.status as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
  }))

  return { claims, drafts }
}
```
Dann `getFahrzeugSchaeden`s Body 2)+3) durch `return ladeSchaedenFuerFahrzeug(db, vehicleId)` ersetzen (der `flotten_fahrzeuge`-Gate + `if (!ownerRow) return { claims: [], drafts: [] }` bleiben davor stehen).

- [ ] **Schritt 3b: `kunde/fahrzeug-schaeden.ts` implementieren**
```ts
// src/lib/kunde/fahrzeug-schaeden.ts
// Owner-scoped Schaden-Loader (WS H). Gate: das Fahrzeug muss dem Kunden gehoeren
// (vehicles.current_owner_id = userId). Danach der geteilte FM-Kern.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeSchaedenFuerFahrzeug, type FahrzeugSchaeden } from '@/lib/flotte/fahrzeug-schaeden'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

/** Claims + Draft-Leads eines Fahrzeugs — streng owner-scoped. Gibt leer zurueck,
 *  wenn das Fahrzeug nicht dem Kunden gehoert (kein Cross-Owner-Leak). */
export async function getKundeFahrzeugSchaeden(
  db: AnyDb, userId: string, vehicleId: string,
): Promise<FahrzeugSchaeden> {
  const { data: ownerRow } = await db
    .from('vehicles').select('id')
    .eq('id', vehicleId).eq('current_owner_id', userId)
    .maybeSingle()
  if (!ownerRow) return { claims: [], drafts: [] }
  return ladeSchaedenFuerFahrzeug(db, vehicleId)
}
```

- [ ] **Schritt 4: Beide Test-Suites laufen (PASS)** — `npx vitest run src/lib/kunde/__tests__/fahrzeug-schaeden.test.ts src/lib/flotte` → PASS (FM-Test unverändert grün = Refactor verhaltens-identisch).

- [ ] **Schritt 5: Commit**
```bash
git add src/lib/kunde/fahrzeug-schaeden.ts src/lib/kunde/__tests__/fahrzeug-schaeden.test.ts src/lib/flotte/fahrzeug-schaeden.ts
git commit -m "feat(netzwerk): owner-scoped getKundeFahrzeugSchaeden + FM-Kern extrahiert (P6 T2)"
```

---

## Task 3: `vehicles.current_owner_id`-Writer + Wiring in `finalizeKundeSetup`

**Files:**
- Create: `src/lib/vehicles/owner.ts`
- Test: `src/lib/vehicles/__tests__/owner.test.ts`
- Modify: `src/app/flow/[token]/actions.ts` (Aufruf in `finalizeKundeSetup`, ~Z.548 nach Pflichtdok-Sync)

**Interfaces:**
- Produces: `setVehicleOwnerFuerFall(db, fallId, userId): Promise<{ ok: boolean; gesetzt: number }>` — löst das Fahrzeug des Falls (`faelle_claim_bridge → claims.vehicle_id`) auf und setzt `current_owner_id = userId`, **nur wo NULL** (kein Clobber). Non-critical.

- [ ] **Schritt 1: Failing Test schreiben**
```ts
// src/lib/vehicles/__tests__/owner.test.ts
import { describe, it, expect, vi } from 'vitest'
import { setVehicleOwnerFuerFall } from '../owner'

function mockDb(vehicleId: string | null) {
  const updEq2 = vi.fn().mockResolvedValue({ error: null, count: vehicleId ? 1 : 0 })
  const updIsNull = vi.fn(() => ({ eq: updEq2 }))    // .is('current_owner_id', null).eq('id', …)
  const update = vi.fn(() => ({ eq: () => ({ is: updIsNull }) }))
  const from = vi.fn((table: string) => {
    if (table === 'faelle_claim_bridge')
      return { select: () => ({ eq: () => ({ maybeSingle:
        () => Promise.resolve({ data: { claim_id: 'c1' }, error: null }) }) }) }
    if (table === 'claims')
      return { select: () => ({ eq: () => ({ maybeSingle:
        () => Promise.resolve({ data: { vehicle_id: vehicleId }, error: null }) }) }) }
    return { update } // vehicles
  })
  return { db: { from } as never, update }
}

describe('setVehicleOwnerFuerFall', () => {
  it('setzt current_owner_id für das Fall-Fahrzeug', async () => {
    const { db, update } = mockDb('v1')
    const res = await setVehicleOwnerFuerFall(db, 'f1', 'u1')
    expect(update).toHaveBeenCalledWith({ current_owner_id: 'u1' })
    expect(res).toEqual({ ok: true, gesetzt: 1 })
  })
  it('no-op wenn der Fall kein Fahrzeug hat', async () => {
    const { db } = mockDb(null)
    expect(await setVehicleOwnerFuerFall(db, 'f1', 'u1')).toEqual({ ok: true, gesetzt: 0 })
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/vehicles/__tests__/owner.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/vehicles/owner.ts
// WS H / K8: Kunden-Halterschaft auf vehicles.current_owner_id schreiben.
// vehicles.current_owner_id war 0/14 befuellt (kein Writer) → dieser Helper schliesst
// die Luecke go-forward (Backfill = Task 4). Owner-scoped (Kunde) ≠ firma-scoped (FM).
// Direkter UPDATE (kein vehicle_ownership_history-Insert) — der owner-scoped READ braucht
// nur current_owner_id; die Historie ist bewusst v1-out-of-scope. Non-critical: wirft nie.
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export async function setVehicleOwnerFuerFall(
  db: AnyDb, fallId: string, userId: string,
): Promise<{ ok: boolean; gesetzt: number }> {
  // fall → claim (Bridge) → vehicle_id
  const { data: bridge } = await db
    .from('faelle_claim_bridge').select('claim_id').eq('fall_id', fallId).maybeSingle()
  const claimId = (bridge as { claim_id?: string | null } | null)?.claim_id ?? null
  if (!claimId) return { ok: true, gesetzt: 0 }
  const { data: claim } = await db
    .from('claims').select('vehicle_id').eq('id', claimId).maybeSingle()
  const vehicleId = (claim as { vehicle_id?: string | null } | null)?.vehicle_id ?? null
  if (!vehicleId) return { ok: true, gesetzt: 0 }
  // NUR wo NULL setzen: einen bereits gesetzten (evtl. abweichenden) Halter nicht clobbern.
  const { error, count } = await db
    .from('vehicles').update({ current_owner_id: userId }, { count: 'exact' })
    .is('current_owner_id', null).eq('id', vehicleId)
  if (error) { console.warn('[setVehicleOwnerFuerFall] non-fatal:', error.message); return { ok: false, gesetzt: 0 } }
  return { ok: true, gesetzt: count ?? 0 }
}
```
> Hinweis: der Test mockt `.update(payload).eq().is()` — die reale Kette ist `.update(payload, {count}).is().eq()`. Beim Implementieren die Kette **exakt** so schreiben wie im Code oben (`.is(...).eq(...)`) und den Test-Mock (Schritt 1) an dieselbe Reihenfolge angleichen, falls die vitest-Chain-Reihenfolge abweicht.

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/vehicles/__tests__/owner.test.ts` → PASS.

- [ ] **Schritt 5: In `finalizeKundeSetup` verdrahten** — in `src/app/flow/[token]/actions.ts`, im `finalizeKundeSetup`-Body (nach dem Pflichtdok-Sync-Block, ~Z.566), fail-soft ergänzen:
```ts
// WS H / K8: Kunde ist jetzt Account-Inhaber → sein Fahrzeug bekommt current_owner_id.
// Fail-soft: eine fehlende Halter-Attribution darf das Onboarding nie brechen.
try {
  const { setVehicleOwnerFuerFall } = await import('@/lib/vehicles/owner')
  await setVehicleOwnerFuerFall(admin, fallId, profileId)
} catch (err) {
  console.warn('[finalizeKundeSetup] setVehicleOwnerFuerFall non-fatal:', err)
}
```
(`admin` = service-role-Client, `profileId` = die Kunden-`profiles.id` — beide im `finalizeKundeSetup`-Scope vorhanden; die Signatur ist `finalizeKundeSetup(admin, fallId, profileId, …)`.)

- [ ] **Schritt 6: tsc + Commit**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add src/lib/vehicles/owner.ts src/lib/vehicles/__tests__/owner.test.ts src/app/flow/[token]/actions.ts
git commit -m "feat(netzwerk): vehicles.current_owner_id writer + finalizeKundeSetup wiring (P6 T3)"
```

---

## Task 4: Backfill `current_owner_id` + Two-vehicles-per-car-Merge-Test

**Files:**
- Create: `scripts/backfill/vehicle-owner-from-claims.mjs`
- Modify: `src/lib/vehicles/ensure-vehicle.test.ts` (Owner-/Stub-Merge-Assertion ergänzen)

**Interfaces:**
- Consumes: `merge_stub_vehicle`-RPC (bereits appliziert, Mig `20260721174847` — rehängt claims/claim_parties/leads/repairs/flotten_fahrzeuge/**schadenkarten**/vehicle_ownership_history + löscht den Stub).
- Produces: idempotenter Backfill (kein Code-Consumer). Der Merge-Test dokumentiert die Zwei-Fahrzeuge-pro-Auto-Invariante.

- [ ] **Schritt 1: Backfill-Script schreiben** (idempotent, `--dry` default; setzt nur `current_owner_id IS NULL`):
```js
// scripts/backfill/vehicle-owner-from-claims.mjs
// Einmaliger Backfill (K8): vehicles.current_owner_id aus dem geschaedigter-Halter des
// juengsten Claims mit diesem vehicle_id ableiten. Idempotent (nur NULL), --apply zum Schreiben.
import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt (--env-file=.env.local?)'); process.exit(1) }
const db = createClient(url, key)
const apply = process.argv.includes('--apply')

const { data: vehicles } = await db.from('vehicles').select('id').is('current_owner_id', null)
let planned = 0
for (const v of vehicles ?? []) {
  // juengster Claim mit diesem Fahrzeug
  const { data: claim } = await db.from('claims')
    .select('id').eq('vehicle_id', v.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!claim) continue
  // geschaedigter-Halter (claim_parties.user_id) ODER faelle.kunde_id-Fallback via Bridge
  const { data: party } = await db.from('claim_parties')
    .select('user_id').eq('claim_id', claim.id).eq('rolle', 'geschaedigter').not('user_id', 'is', null).maybeSingle()
  let ownerId = party?.user_id ?? null
  if (!ownerId) {
    const { data: bridge } = await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', claim.id).maybeSingle()
    if (bridge?.fall_id) {
      const { data: fall } = await db.from('faelle').select('kunde_id').eq('id', bridge.fall_id).maybeSingle()
      ownerId = fall?.kunde_id ?? null
    }
  }
  if (!ownerId) continue
  planned++
  if (apply) {
    const { error } = await db.from('vehicles').update({ current_owner_id: ownerId }).is('current_owner_id', null).eq('id', v.id)
    if (error) console.error('  FAIL', v.id, error.message); else console.log('  set', v.id, '→', ownerId)
  } else {
    console.log('  would set', v.id, '→', ownerId)
  }
}
console.log(`${apply ? 'applied' : 'planned'}: ${planned} vehicles`)
```

- [ ] **Schritt 2: Dry-Run gegen prod** (nur Lesen):
```bash
node --env-file=.env.local scripts/backfill/vehicle-owner-from-claims.mjs
```
Erwartet: `planned: <n>` (≤7, da nur 7 Claims ein Fahrzeug haben). Plausibilität prüfen (die aufgelisteten vehicle→owner-Paare).

- [ ] **Schritt 3: Merge-Invariante testen** — in `src/lib/vehicles/ensure-vehicle.test.ts` einen Case ergänzen, der beweist, dass der Stub→FIN-Umzug den `merge_stub_vehicle`-RPC (der Karten/Claims/Halter mit-rehängt) mit den richtigen Argumenten triggert:
```ts
it('two-vehicles-per-car: Stub mit gebundener Karte → ensureVehicleFromFin ruft merge_stub_vehicle(stub→FIN)', async () => {
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: 'v-fin', error: null })          // upsert_vehicle_by_fin → FIN-Row-id
    .mockResolvedValueOnce({ data: null, error: null })             // merge_stub_vehicle
  const db = {
    rpc,
    from: (t: string) => t === 'vehicles'
      ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { fin: null }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      : { update: () => ({ eq: () => Promise.resolve({ error: null }) }) },
  } as never
  const { ensureVehicleFromFin } = await import('./ensure-vehicle')
  const res = await ensureVehicleFromFin({ fin: 'WBAAA00000AAAAAAAX'.slice(0,17), db, supersedesVehicleId: 'v-stub' })
  expect(res.ok).toBe(true)
  // Der Rehang (inkl. schadenkarten.fahrzeug_id + Demote gebunden→ersetzt) passiert DB-seitig im RPC:
  expect(rpc).toHaveBeenCalledWith('merge_stub_vehicle', { p_stub: 'v-stub', p_target: 'v-fin' })
})
```
> Der tatsächliche Karten-/Claim-Rehang lebt in `merge_stub_vehicle` (Mig `20260721174847`, Z.36-39: `schadenkarten status='ersetzt'` bei Kollision, sonst `fahrzeug_id=p_target`). Das ist die DB-seitige Invariante; der Unit-Test sichert die **Verdrahtung** (richtiger RPC, richtige Args). Die End-to-End-Korrektheit ist ein Regel-4-Item (DoD).

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/vehicles/ensure-vehicle.test.ts` → PASS.

- [ ] **Schritt 5: Backfill anwenden** (nach PR-Merge, koordiniert — schreibt prod-Daten):
```bash
node --env-file=.env.local scripts/backfill/vehicle-owner-from-claims.mjs --apply
# Verifikation (execute_sql READ): select count(current_owner_id) from vehicles;  -- > 0
```

- [ ] **Schritt 6: Commit** (Script + Test; der `--apply`-Lauf ist ein Betriebsschritt, kein Commit-Artefakt)
```bash
git add scripts/backfill/vehicle-owner-from-claims.mjs src/lib/vehicles/ensure-vehicle.test.ts
git commit -m "feat(netzwerk): current_owner_id backfill script + two-vehicles-per-car merge test (P6 T4)"
```

---

## Task 5: `/kunde/fahrzeuge` Übersicht + Nav-Einstiegspunkt

**Files:**
- Create: `src/app/kunde/fahrzeuge/page.tsx`
- Modify: `src/app/kunde/_components/KundeNav.tsx` (Nav-Item „Fahrzeuge")

**Interfaces:**
- Consumes: `getKundeFahrzeuge` (Task 1).
- Produces: Route `/kunde/fahrzeuge`; sichtbarer Nav-Einstieg. Verlinkt je Fahrzeug auf `/kunde/fahrzeuge/[id]` (Task 6). Ein-Auto-Kunde → Auto-Redirect auf die Detail-Page.

- [ ] **Schritt 1: Nav-Item ergänzen** — in `KundeNav.tsx` `buildNavItems`, das neue Item **vor** „Flotte" einfügen (eigenes Icon, nicht `CarIcon` das „Flotte" nutzt); Import erweitern:
```ts
import { HomeIcon, MessageSquareIcon, UserIcon, SearchIcon, CalendarIcon, CarIcon, CarFrontIcon, PlusCircleIcon } from 'lucide-react'
// … in der Items-Liste, nach fallItem/termine/nachbesichtigung:
{ href: '/kunde/fahrzeuge', label: 'Fahrzeuge', icon: CarFrontIcon, exact: false },
```
(„Meine Fälle"/„Mein Fall" bleibt als HomeIcon-Home erhalten — additive fahrzeug-zentrische Sicht; siehe Spec-Treue-Notiz in der DoD. Label hardcoded DE analog zum bestehenden `'Flotte'`-Muster; i18n-Follow-up wie dort vermerkt.)

- [ ] **Schritt 2: Übersichts-Page implementieren**
```tsx
// src/app/kunde/fahrzeuge/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKundeFahrzeuge } from '@/lib/kunde/fahrzeuge'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'
import { CarFrontIcon, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function KundeFahrzeugeUebersicht() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  try {
    const admin = createAdminClient()
    const fahrzeuge = await getKundeFahrzeuge(admin, user.id)

    // Ein-Auto-Kunde direkt in die Detail-Page (Aaron: „auto-expandiert").
    if (fahrzeuge.length === 1) redirect(`/kunde/fahrzeuge/${fahrzeuge[0].vehicleId}`)

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-claimondo-navy">Meine Fahrzeuge</h1>
          <p className="mt-1 text-sm text-claimondo-shield">Übersicht Ihrer Fahrzeuge und ihrer Schadenhistorie.</p>
        </div>
        {fahrzeuge.length === 0 ? (
          <EmptyState icon={CarFrontIcon} title="Noch keine Fahrzeuge"
            description="Sobald ein Schaden mit Fahrzeugdaten erfasst ist, erscheint das Fahrzeug hier." />
        ) : (
          <SectionCard title="Fahrzeuge">
            <ul className="divide-y divide-claimondo-border">
              {fahrzeuge.map((f) => (
                <li key={f.vehicleId}>
                  <Link href={`/kunde/fahrzeuge/${f.vehicleId}`}
                    className="flex items-center gap-3 py-3 rounded-ios-sm hover:bg-claimondo-bg transition-colors group">
                    <CarFrontIcon className="w-5 h-5 text-claimondo-shield shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-claimondo-navy truncate">
                        {f.kennzeichen ?? 'Fahrzeug'}
                      </span>
                      <span className="block text-body-xs text-claimondo-shield truncate">
                        {[f.hersteller, f.modell].filter(Boolean).join(' ') || '—'}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-claimondo-shield shrink-0 group-hover:text-claimondo-navy transition-colors" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    )
  } catch (err) {
    if (isRedirectError(err)) throw err   // Redirect-Control-Flow durchreichen (nicht schlucken)
    console.error('[KundeFahrzeuge] Error:', err)
    return <div className="p-8 text-center"><p className="text-danger font-semibold">Fehler beim Laden der Fahrzeuge.</p></div>
  }
}
```
> **Redirect-Stub-Gate:** die Page hat einen Content-`return` (Liste/EmptyState) → **kein** reiner Redirect-Stub (der Single-Vehicle-`redirect()` ist bedingt). Kein Gate-Verstoß.

- [ ] **Schritt 3: Build** (Route/Layout-Change → voller Build, nicht nur tsc):
```bash
npm run build
```
Erwartet: grün; `/kunde/fahrzeuge` in der Route-Liste.

- [ ] **Schritt 4: Commit**
```bash
git add src/app/kunde/fahrzeuge/page.tsx src/app/kunde/_components/KundeNav.tsx
git commit -m "feat(netzwerk): /kunde/fahrzeuge Übersicht + Nav-Einstieg (P6 T5)"
```

---

## Task 6: `/kunde/fahrzeuge/[id]` — Stammdaten + Schadenhistorie

**⚠ Koordination:** `FahrzeugSchaedenSection` (63fe43f9/FM) wird **additiv** um einen optionalen `schadenHrefBase`-Prop erweitert (FM-Default unverändert).

**Files:**
- Create: `src/app/kunde/fahrzeuge/[id]/page.tsx`
- Modify: `src/components/flotte/FahrzeugSchaedenSection.tsx` (optionaler `schadenHrefBase`-Prop)

**Interfaces:**
- Consumes: `getKundeFahrzeuge` (Task 1, für Owner-Gate + Stammdaten), `getKundeFahrzeugSchaeden` (Task 2), `FahrzeugSchaedenSection`.
- Produces: Route `/kunde/fahrzeuge/[id]`; Schadenhistorie-Zeilen verlinken auf `/kunde/fahrzeuge/[id]/schaden/[claimId]` (Task 7).

- [ ] **Schritt 1: `FahrzeugSchaedenSection` additiv parametrisieren** — Link-Basis aus dem hartkodierten FM-Pfad in einen optionalen Prop ziehen (Default = FM-Verhalten):
```tsx
// Props ergänzen:
  /** Link-Basis fuer die Schaden-Detail-Route. Default = FM-Portal. Kunde: '/kunde/fahrzeuge'. */
  schadenHrefBase?: string
// im Destructuring: … , schadenHrefBase = '/flotte/fahrzeug' }: Props) {
// im Claims-Link href:
  href={`${schadenHrefBase}/${vehicleId}/schaden/${c.claimId}`}
```
(Alle anderen Props — `onStorno`/`onEntwurf*` — sind bereits optional → der Kunde rendert die Sektion read-only ohne sie.)

- [ ] **Schritt 2: Detail-Page implementieren**
```tsx
// src/app/kunde/fahrzeuge/[id]/page.tsx
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKundeFahrzeuge } from '@/lib/kunde/fahrzeuge'
import { getKundeFahrzeugSchaeden } from '@/lib/kunde/fahrzeug-schaeden'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'
import { FahrzeugSchaedenSection } from '@/components/flotte/FahrzeugSchaedenSection'
import { CarFrontIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function KundeFahrzeugDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  try {
    const admin = createAdminClient()
    // Owner-Gate + Stammdaten in einem: getKundeFahrzeuge ist owner-scoped.
    const fahrzeug = (await getKundeFahrzeuge(admin, user.id)).find((f) => f.vehicleId === id) ?? null
    if (!fahrzeug) {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
          <EmptyState icon={CarFrontIcon} title="Fahrzeug nicht gefunden"
            description="Dieses Fahrzeug gehört nicht zu Ihrem Konto oder existiert nicht." />
        </div>
      )
    }
    const schaeden = await getKundeFahrzeugSchaeden(admin, user.id, id)

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-claimondo-navy">{fahrzeug.kennzeichen ?? 'Fahrzeug'}</h1>
          <p className="mt-1 text-sm text-claimondo-shield">Fahrzeug-Details</p>
        </div>

        <SectionCard title="Stammdaten">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-claimondo-shield">Kennzeichen</dt><dd className="text-claimondo-navy">{fahrzeug.kennzeichen ?? '—'}</dd>
            <dt className="text-claimondo-shield">Hersteller</dt><dd className="text-claimondo-navy">{fahrzeug.hersteller ?? '—'}</dd>
            <dt className="text-claimondo-shield">Modell</dt><dd className="text-claimondo-navy">{fahrzeug.modell ?? '—'}</dd>
            <dt className="text-claimondo-shield">Farbe</dt><dd className="text-claimondo-navy">{fahrzeug.farbe ?? '—'}</dd>
            <dt className="text-claimondo-shield">Kilometerstand</dt>
            <dd className="text-claimondo-navy">{fahrzeug.kilometerstand != null ? `${fahrzeug.kilometerstand.toLocaleString('de-DE')} km` : '—'}</dd>
          </dl>
        </SectionCard>

        {/* Schadenhistorie — reused FM-Sektion, read-only (keine onStorno/onEntwurf-Props),
            Link-Basis auf das Kunde-Portal umgebogen. */}
        <FahrzeugSchaedenSection schaeden={schaeden} vehicleId={id} schadenHrefBase="/kunde/fahrzeuge" />
      </div>
    )
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[KundeFahrzeugDetail] Error:', err)
    return <div className="p-8 text-center"><p className="text-danger font-semibold">Fehler beim Laden.</p></div>
  }
}
```

- [ ] **Schritt 3: Build** — `npm run build` → grün; `/kunde/fahrzeuge/[id]` in der Route-Liste. (FM-Portal unverändert: `FahrzeugSchaedenSection` ohne `schadenHrefBase` linkt weiter auf `/flotte/fahrzeug/...`.)

- [ ] **Schritt 4: Commit**
```bash
git add src/app/kunde/fahrzeuge/[id]/page.tsx src/components/flotte/FahrzeugSchaedenSection.tsx
git commit -m "feat(netzwerk): /kunde/fahrzeuge/[id] Stammdaten + Schadenhistorie (P6 T6)"
```

---

## Task 7: `/kunde/fahrzeuge/[id]/schaden/[claimId]` (reuse getClaimDetail) + Legacy-Redirect

**⚠ C-Migration (C4):** Diese Route **konsumiert** `getKundeClaimView`/`getClaimDetail('kunde')` + `<KundeClaimView>` (Claims-Programm). NICHT neu bauen, NICHT forken.

**Files:**
- Create: `src/app/kunde/fahrzeuge/[id]/schaden/[claimId]/page.tsx`
- Modify: `src/app/kunde/faelle/[id]/page.tsx` (kanonischer Legacy-Redirect wenn Fahrzeug vorhanden)

**Interfaces:**
- Consumes: `getKundeClaimView` (`src/lib/claims/kunde-claim-view.ts`), `KundeClaimView` (`src/components/kunde/claim-view/KundeClaimView.tsx`).
- Produces: kanonische Schaden-Detail-Route unter dem Fahrzeug. `/kunde/faelle/[id]` redirectet dorthin, **wenn** der Claim ein owned Fahrzeug hat (sonst rendert es in place → keine vehicle-losen Claims stranden).

- [ ] **Schritt 1: Schaden-Detail-Route implementieren** (Owner-Gate übers Fahrzeug, dann die bestehende Kunde-Claim-Sicht):
```tsx
// src/app/kunde/fahrzeuge/[id]/schaden/[claimId]/page.tsx
import { redirect, notFound } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { isHTTPAccessFallbackError } from 'next/dist/client/components/http-access-fallback/http-access-fallback'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKundeFahrzeuge } from '@/lib/kunde/fahrzeuge'
import { getKundeClaimView } from '@/lib/claims/kunde-claim-view'
import { KundeClaimView } from '@/components/kunde/claim-view/KundeClaimView'

export const dynamic = 'force-dynamic'

export default async function KundeFahrzeugSchadenDetail({ params }: { params: Promise<{ id: string; claimId: string }> }) {
  const { id, claimId } = await params
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')
    const admin = createAdminClient()

    // Gate 1: Fahrzeug gehoert dem Kunden?
    const owns = (await getKundeFahrzeuge(admin, user.id)).some((f) => f.vehicleId === id)
    if (!owns) notFound()

    // Gate 2 + Daten: die bestehende ownership-aufloesende Kunde-Claim-Sicht (C4). null → 404.
    const vm = await getKundeClaimView(admin, user.id, user.email ?? null, claimId)
    if (!vm) notFound()

    return <KundeClaimView vm={vm} />
  } catch (err) {
    if (isRedirectError(err) || isHTTPAccessFallbackError(err)) throw err
    console.error('[KundeFahrzeugSchadenDetail] Error:', err)
    return <div className="p-8 text-center"><p className="text-danger font-semibold">Fehler beim Laden.</p></div>
  }
}
```

- [ ] **Schritt 2: `/kunde/faelle/[id]` zum kanonischen Legacy-Redirect erweitern** — in `src/app/kunde/faelle/[id]/page.tsx` **nach** dem CMM-63-Canonicalize (`if (vm.claimId && routeId !== vm.claimId) redirect(...)`) und **vor** `return <KundeClaimView …>` einfügen:
```tsx
// WS H: fahrzeug-zentrische Kanonik — hat der Claim ein owned Fahrzeug, ist die kanonische
// URL /kunde/fahrzeuge/[vehId]/schaden/[claimId]. Vehicle-lose Claims (16/23) rendern hier
// weiter in place → KEIN reiner Redirect-Stub (Content-return unten), kein Stranding.
const canonicalClaimId = vm.claimId ?? routeId
const { data: claimVeh } = await admin.from('claims').select('vehicle_id').eq('id', canonicalClaimId).maybeSingle()
const vehId = (claimVeh as { vehicle_id?: string | null } | null)?.vehicle_id ?? null
if (vehId) {
  const { data: owned } = await admin.from('vehicles').select('id').eq('id', vehId).eq('current_owner_id', user.id).maybeSingle()
  if (owned) redirect(`/kunde/fahrzeuge/${vehId}/schaden/${canonicalClaimId}`)
}
```
> **Redirect-Stub-Gate:** `/kunde/faelle/[id]` behält seinen `return <KundeClaimView>` (vehicle-lose Claims + nicht-owned-Fallback) → weiterhin **kein** reiner Redirect-Stub. Der bestehende `isRedirectError(err)`-Re-Throw im catch trägt den neuen `redirect()` korrekt an die Boundary.

- [ ] **Schritt 3: Build** — `npm run build` → grün; beide neuen Routen gelistet.

- [ ] **Schritt 4: Commit**
```bash
git add "src/app/kunde/fahrzeuge/[id]/schaden/[claimId]/page.tsx" "src/app/kunde/faelle/[id]/page.tsx"
git commit -m "feat(netzwerk): fahrzeug-scoped Schaden-Detail (reuse getClaimDetail) + faelle Legacy-Redirect (P6 T7)"
```

---

## Task 8: Wording-Rebrand „Schadenkarte" → „Netzwerkkarte" (nur UI-Strings)

**Scope:** **Nur nutzersichtbare Strings.** DB-Tabelle `schadenkarten`, Spalten (`karten_token`), Funktions-/Datei-/Component-Namen (`SchadenkarteScanner`, `generateSchadenkarteToken`, Route `/schaden/[token]`, `buildSchadenkarteUrl`) **bleiben** (Backend-frei, kein Rename-Risiko).

**Files (nur die enumerierten User-Strings ändern):**
- `src/components/flotte/SchadenkarteBindenSection.tsx` — Z.50 Toast „Netzwerkkarte erfolgreich gebunden.", Z.57/65 Titel „Netzwerkkarten binden", Z.66 Subtitle („…jeder Netzwerkkarte…")
- `src/components/flotte/FahrzeugKarteBindClient.tsx` — Z.39 „…QR-Code der Netzwerkkarte…"
- `src/app/schaden/[token]/page.tsx` — Z.81 „Netzwerkkarte nicht gefunden", Z.84 „Diese Netzwerkkarte ist ungültig…"
- `src/app/schaden/[token]/FlottenmanagerKartePanel.tsx` — Z.70 „Netzwerkkarte binden", Z.106 „Netzwerkkarte"
- `src/app/flotte/(shell)/karten/page.tsx` — Z.30 „Gebundene Netzwerkkarten verwalten…"
- `src/app/flotte/(shell)/karten/KartenClient.tsx` — Z.108 „Ihre Netzwerkkarten", Z.110 „Noch keine Netzwerkkarten vorhanden."
- `src/app/flotte/(shell)/flotte/page.tsx` — Z.50 „…Grundlage für die Netzwerkkarten.", Z.58 „Netzwerkkarten binden", Z.59 „…bereits eine Netzwerkkarte."
- `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx` — Z.148 `<SectionCard title="Netzwerkkarte">`, Z.161 „QR-Code der Netzwerkkarte — auf die Karte kleben oder als Ersatz ausdrucken."

- [ ] **Schritt 1: Baseline-Grep** — die exakte Ist-Menge festhalten (dient auch als Vollständigkeits-Check danach):
```bash
npx rg -n "Schadenkarte" src --glob '*.tsx'
```
- [ ] **Schritt 2: Strings ersetzen** — je oben gelistete Zeile „Schadenkarte(n)" → „Netzwerkkarte(n)" (echte Umlaute; die QR-Download-`fileBaseName={`schadenkarte-…`}` bleibt — interner Dateiname, kein UI-Text im Sinne der Marke, optional angleichbar).
- [ ] **Schritt 3: Verifizieren** — erneut `npx rg -n "Schadenkarte" src --glob '*.tsx'`: es dürfen **nur** noch Kommentare / Component-Namen / Imports (`SchadenkarteScanner`, `resolveSchadenkarteToFahrzeug`, `buildSchadenkarteUrl`) übrig sein, **keine** JSX-Text-Literale mehr.
- [ ] **Schritt 4: Build** — `npm run build` → grün.
- [ ] **Schritt 5: Commit**
```bash
git add src/components/flotte/SchadenkarteBindenSection.tsx src/components/flotte/FahrzeugKarteBindClient.tsx "src/app/schaden/[token]/page.tsx" "src/app/schaden/[token]/FlottenmanagerKartePanel.tsx" "src/app/flotte/(shell)/karten/page.tsx" "src/app/flotte/(shell)/karten/KartenClient.tsx" "src/app/flotte/(shell)/flotte/page.tsx" "src/app/flotte/(shell)/fahrzeug/[id]/page.tsx"
git commit -m "feat(netzwerk): Wording Schadenkarte→Netzwerkkarte (UI-Strings, DB unveraendert) (P6 T8)"
```

---

## Task 9: ON-DELETE-Zombie-Fix — BEFORE-DELETE-Trigger auf `vehicles`

**⚠ C-Migration / DDL:** via **`apply_migration`** (Regel 2). Kein neuer Enum (reused `'frei'`) → **kein** flag-drift-Snapshot-Change.

**Problem (K9, fresh verifiziert):** `schadenkarten_fahrzeug_id_fkey` ist **ON DELETE SET NULL** (`confdeltype='n'`). Wird ein `vehicles`-Row gelöscht, wird `schadenkarten.fahrzeug_id=NULL`, aber `status` bleibt `'gebunden'` → **Zombie-Karte** (Partial-Unique `schadenkarten_fahrzeug_gebunden_uniq` greift nicht mehr, Karte hängt tot).

**Fix:** BEFORE-DELETE-Trigger entbindet gebundene Karten sauber (Semantik wie `entbindeSchadenkarte`: `status='frei'`, `fahrzeug_id=NULL`, `gebunden_*=NULL`). **Interaktion mit `merge_stub_vehicle` unkritisch:** dessen `UPDATE schadenkarten SET fahrzeug_id=p_target WHERE fahrzeug_id=p_stub` (Mig `20260721174847` Z.39) läuft **vor** dem `DELETE FROM vehicles WHERE id=p_stub` (Z.47) → beim DELETE zeigt keine Karte mehr auf den Stub, der Trigger findet 0 Zeilen. Kein Konflikt.

**Files:**
- Create (DDL via Plugin): `supabase/migrations/<V>_entbinde_karten_bei_fahrzeug_delete.sql`
- Modify: `src/lib/supabase/database.types.ts` (regen — Trigger ändert das Schema formal nicht, aber Snapshot-Konsistenz)

- [ ] **Schritt 1: Zombie-Reproduktion dokumentieren** (READ, bestätigt das Ausgangsverhalten — es dürfen keine live Zombies existieren, wenn doch, sind sie der Beweis):
```sql
select count(*) as aktuelle_zombies from schadenkarten where fahrzeug_id is null and status='gebunden';
```
- [ ] **Schritt 2: Migration anwenden** (`apply_migration`, name `entbinde_karten_bei_fahrzeug_delete`):
```sql
create or replace function public.entbinde_karten_bei_fahrzeug_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fahrzeug wird geloescht → gebundene Netzwerkkarten sauber entbinden (statt Zombie via FK-SET-NULL).
  -- Semantik = entbindeSchadenkarte (status='frei'). Reused Enum 'frei' → kein CHECK/flag-drift-Change.
  update public.schadenkarten
     set status = 'frei', fahrzeug_id = null, gebunden_am = null, gebunden_von = null
   where fahrzeug_id = old.id and status = 'gebunden';
  return old;
end;
$$;

drop trigger if exists trg_entbinde_karten_bei_fahrzeug_delete on public.vehicles;
create trigger trg_entbinde_karten_bei_fahrzeug_delete
  before delete on public.vehicles
  for each row execute function public.entbinde_karten_bei_fahrzeug_delete();
```
- [ ] **Schritt 3: Getrackte Version ablesen + File committen** — `list_migrations` → `<V>`; File `supabase/migrations/<V>_entbinde_karten_bei_fahrzeug_delete.sql` mit exakt obigem DDL (Dateiname == `<V>`).
- [ ] **Schritt 4: Verifizieren** (`execute_sql` READ):
```sql
select tgname, tgenabled from pg_trigger
  where tgrelid='public.vehicles'::regclass and tgname='trg_entbinde_karten_bei_fahrzeug_delete';
-- erwartet: 1 Zeile, tgenabled='O' (enabled)
```
- [ ] **Schritt 5: Typen regen + Ratchets + Commit**
```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
npm run check:flag-drift -- --ratchet && npm run check:rls-policies -- --ratchet
git add supabase/migrations src/lib/supabase/database.types.ts
git commit -m "fix(netzwerk): BEFORE-DELETE-Trigger entbindet Karten (Zombie-Fix, K9) (P6 T9)"
```

---

## Task 10: Scan → Bindung — `claims.netzwerk_owner_id` = Karten-Issuer (Flotte)

**⚠ HARD-BLOCK auf P0-T3:** `claims.netzwerk_owner_id` existiert erst nach dem P0-Merge (fresh: 0 Spalten auf `claims`). **Diesen Task erst starten/mergen, wenn P0 gemergt ist.** Tasks 1–9 laufen unabhängig weiter.

**Files:**
- Create: `src/lib/schadenkarte/netzwerk-owner.ts`
- Test: `src/lib/schadenkarte/__tests__/netzwerk-owner.test.ts`
- Modify: `src/app/schaden/[token]/actions.ts` (Attribution nach `convertLeadToClaim`)

**Interfaces:**
- Consumes: `firmen_flotten_konten(firma_id, user_id)` (Issuer→Profil), `claims.netzwerk_owner_id` (P0-T3).
- Produces: `resolveNetzwerkOwnerFuerFlotte(db, firmaId): Promise<string | null>` (Flotte-Issuer → `profiles.id`); Attribution-Write im Scan-Pfad. **Generischer Issuer (SV/Werkstatt) = dokumentierter Hook, nicht gebaut** (`schadenkarten` trägt heute nur `firma_id` als Issuer; Privatkunden-Rollout später).

- [ ] **Schritt 1: Failing Test schreiben**
```ts
// src/lib/schadenkarte/__tests__/netzwerk-owner.test.ts
import { describe, it, expect } from 'vitest'
import { resolveNetzwerkOwnerFuerFlotte } from '../netzwerk-owner'

function mockDb(userId: string | null) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle:
    () => Promise.resolve({ data: userId ? { user_id: userId } : null, error: null }) }) }) }) } as never
}
describe('resolveNetzwerkOwnerFuerFlotte', () => {
  it('mappt firma_id → firmen_flotten_konten.user_id (= profiles.id)', async () => {
    expect(await resolveNetzwerkOwnerFuerFlotte(mockDb('owner-1'), 'firma-1')).toBe('owner-1')
  })
  it('null wenn die Firma kein Flotten-Konto hat', async () => {
    expect(await resolveNetzwerkOwnerFuerFlotte(mockDb(null), 'firma-x')).toBeNull()
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/schadenkarte/__tests__/netzwerk-owner.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/schadenkarte/netzwerk-owner.ts
// WS E / Netzwerk-Bindung: der Karten-Issuer wird beim Scan zum netzwerk_owner des Claims.
// v1: Issuer = Flotte (schadenkarten.firma_id) → firmen_flotten_konten.user_id (= profiles.id).
// Hook (nicht gebaut): generischer Issuer (SV/Werkstatt) fuer den Privatkunden-Rollout — sobald
// schadenkarten einen sv_id/werkstatt_id-Issuer traegt, hier eine Typ-Weiche ergaenzen.
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export async function resolveNetzwerkOwnerFuerFlotte(db: AnyDb, firmaId: string): Promise<string | null> {
  const { data } = await db
    .from('firmen_flotten_konten').select('user_id').eq('firma_id', firmaId).maybeSingle()
  return ((data as { user_id?: string | null } | null)?.user_id) ?? null
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/schadenkarte/__tests__/netzwerk-owner.test.ts` → PASS.

- [ ] **Schritt 5: Attribution im Scan-Pfad** — in `src/app/schaden/[token]/actions.ts`, im `if (claimId) { … }`-Bereich nach erfolgreichem `convertLeadToClaim` (vor der FM-WA-Notif, ~Z.247), fail-soft ergänzen:
```ts
// WS E: der Karten-Issuer (Flotte) wird zum netzwerk_owner dieses Claims (Attribution fuer
// den spaeteren Finder-Boost, P2). Fail-soft — darf den Gegner-Submit nie brechen.
if (claimId && ctx.context.firmaId) {
  try {
    const { resolveNetzwerkOwnerFuerFlotte } = await import('@/lib/schadenkarte/netzwerk-owner')
    const ownerId = await resolveNetzwerkOwnerFuerFlotte(db, ctx.context.firmaId)
    if (ownerId) {
      const { error } = await db.from('claims').update({ netzwerk_owner_id: ownerId }).eq('id', claimId)
      if (error) console.error('[schaden-gegner] netzwerk_owner_id set:', error.message)
    }
  } catch (err) {
    console.error('[schaden-gegner] netzwerk-owner attribution warf:', err)
  }
}
```
(`db` = `createAdminClient()` im Scope; `ctx.context.firmaId` kommt aus `resolveSchadenTokenContext`.)

- [ ] **Schritt 6: Verifizieren** (`execute_sql` READ, nach P0-Merge — Spalte existiert):
```sql
select column_name from information_schema.columns
  where table_schema='public' and table_name='claims' and column_name='netzwerk_owner_id';
-- 1 Zeile = P0 gemergt, Task baubar
```
- [ ] **Schritt 7: tsc + Commit**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add src/lib/schadenkarte/netzwerk-owner.ts src/lib/schadenkarte/__tests__/netzwerk-owner.test.ts "src/app/schaden/[token]/actions.ts"
git commit -m "feat(netzwerk): Karten-Scan setzt claims.netzwerk_owner_id = Flotte-Issuer (P6 T10)"
```

---

## Task 11: Voller Gate-Durchlauf + Post-Task-Audit

**Files:** keine (Verifikation vor PR).

- [ ] **Schritt 1: Build + tsc**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run build
```
- [ ] **Schritt 2: Alle Ratchets 0-neu**
```bash
npm run check:redirect-stubs -- --ratchet
npm run check:component-set -- --ratchet
npm run check:status-registry -- --ratchet
npm run check:token-audit
npm run check:flag-drift -- --ratchet
npm run check:knip -- --ratchet
npm run check:rls-policies -- --ratchet
npm run check:vitest -- --ratchet
```
Erwartet: alle exit 0. (Insb. `check:redirect-stubs`: `/kunde/fahrzeuge`, `/kunde/fahrzeuge/[id]`, `/kunde/faelle/[id]` haben Content-returns → keine Stubs.)
- [ ] **Schritt 3: 7-Punkte-Audit im PR-Body dokumentieren** (Build grün / UI-Einstieg `KundeNav` „Fahrzeuge" / Redundanz: FM-Loader+Sektion reused, KundeClaimView reused / Dead-Code: keine / Spec: WS H+E, Abweichungen s.u. / Inkonsistenz: Umlaute+Tokens+`{ok,error}` / Regression: FM-Portal verhaltens-identisch, `/kunde/faelle/[id]`-Bookmarks intakt).
- [ ] **Schritt 4: Session-Abschluss-Checkliste** (Regel 3): `git status` clean, `git stash list` leer, `git log --branches --not --remotes` gepusht.

---

## Definition of Done (P6)

**Deliverables**
- WS H: `/kunde/fahrzeuge` (Übersicht, Ein-Auto-Auto-Expand) → `/kunde/fahrzeuge/[id]` (Stammdaten + Schadenhistorie) → `/kunde/fahrzeuge/[id]/schaden/[claimId]` (reused `getClaimDetail('kunde')`/`KundeClaimView`); Nav-Einstieg „Fahrzeuge"; `/kunde/faelle/[id]` = kanonischer Legacy-Redirect (vehicle-bearing) mit in-place-Fallback (vehicle-los).
- K8: `vehicles.current_owner_id`-Writer (`finalizeKundeSetup`) + idempotenter Backfill-`--apply` (Verifikation: `count(current_owner_id) > 0`); Two-vehicles-per-car-Merge über den bestehenden `merge_stub_vehicle`-RPC (Unit-Test sichert die Verdrahtung; Rehang von Karte+Claim+Halter DB-seitig).
- WS E: Wording „Schadenkarte"→„Netzwerkkarte" (UI-only, DB `schadenkarten` unverändert); ON-DELETE-Zombie-Trigger (K9); Scan→`claims.netzwerk_owner_id`=Flotte-Issuer (Task 10, nach P0).
- tsc + build grün; alle Ratchets 0-neu; vitest grün.

**Journey-Bezug (operatives Soll)**
- *Kunde-Fahrzeug-Journey:* Kunde loggt ein → sieht „Fahrzeuge" → wählt sein Auto → sieht Stammdaten + alle Schäden dieses Autos als Historie → öffnet einen Schaden → landet in der gewohnten phasen-adaptiven Kunde-Fallakte. Ein-Auto-Kunde landet direkt im Auto.
- *Netzwerkkarten-Scan-Journey:* Unfallgegner tappt/scannt die Netzwerkkarte am Flotten-Fahrzeug → `/schaden/[token]` → Meldung erfasst → Claim entsteht → `claims.netzwerk_owner_id` = die Flotte (Karten-Issuer) → dieser Attribut speist später (P2) den „Dein Netzwerk"-Finder-Boost.

**Regel-4 — Prod-Playwright-Smoke (nach Deploy, Test-Konten `telefon=NULL`)**
1. **Kunde fahrzeug-zentrisch** (Test-Kunde mit ≥1 owned Fahrzeug — ggf. Backfill `--apply` + einen Test-Claim mit `vehicle_id` seeden): `/kunde/fahrzeuge` rendert die Liste (nicht leer, nicht 500) → Klick Fahrzeug → Stammdaten + Schadenhistorie sichtbar → Klick Schaden → `KundeClaimView` rendert (kein leerer Shell/kein roher i18n-Key). Ein-Auto-Kunde: `/kunde/fahrzeuge` redirectet auf die Detail-Page. Legacy: `/kunde/faelle/[claimId]` eines vehicle-bearing Claims → 30x auf die Fahrzeug-Schaden-URL; vehicle-loser Claim → rendert weiterhin in place.
2. **Netzwerkkarten-Scan → Bindung** (nach P0-Merge; **Wegwerf-Flotte + Test-Fahrzeug + Test-Karte**, keine echten Kunden-Comms): `/schaden/<SKT-token>` → Gegner-Formular (Test-Nummer) → Submit → Claim entsteht → **Live-DB-Verifikation** (`execute_sql` READ): `select netzwerk_owner_id from claims where id='<neuerClaim>'` == `firmen_flotten_konten.user_id` der Test-Flotte. (Der UI-Scan löst einen echten Write aus → nur Wegwerf-Kontext.)
3. **Netzwerkkarte-Wording** (Read-Surface): `/flotte/karten` + `/flotte/fahrzeug/[id]` zeigen „Netzwerkkarte(n)", nirgends mehr „Schadenkarte" im sichtbaren Text.
4. **Zombie-Fix** (Live-DB, ohne UI-Trigger — Fahrzeug-Delete ist destruktiv): auf einer Wegwerf-Karte+Wegwerf-Fahrzeug `delete from vehicles where id='<test>'` (Wegwerf!) → `select status, fahrzeug_id from schadenkarten where …` == `('frei', null)`; im PR begründen, warum der Delete nur über Wegwerf-Daten lief.

**Two-vehicles-per-car-Test (explizit):** Unit-Test in Task 4 grün (`ensureVehicleFromFin({supersedesVehicleId})` → `merge_stub_vehicle(p_stub, p_target)`), plus die Merge-RPC-Rehang-Klausel (`schadenkarten` Z.36-39, Mig `20260721174847`) als DB-Invariante referenziert. Optional Regel-4: Stub-Fahrzeug mit gebundener Karte + Claim seeden, FIN nachziehen, verifizieren dass Karte (status erhalten) + Claim auf die FIN-Row umziehen und der Stub weg ist.

---

## Self-Review (durchgeführt beim Schreiben)

**1. Spec-Coverage (P6-Zeile der Roadmap + §2b WS H/E + K8/K9):**
- `vehicles.current_owner_id`-Writer → T3 ✓ · Backfill → T4 ✓ · two-vehicles-pro-Auto-Merge → T4 (reused `merge_stub_vehicle`) ✓ · `/kunde/fahrzeuge` (FM-Muster) → T1/T2/T5/T6 ✓ · Schaden-Detail via `getClaimDetail` (C4, nicht neu) → T7 ✓ · `/kunde/faelle/[id]` Legacy-Redirect → T7 ✓ · Netzwerkkarte-Rebrand (SKT-Token, token-basiert) → T8 ✓ · ON-DELETE-Fix → T9 ✓ · Scan→`netzwerk_owner_id` (Flotte, generischer Issuer=Hook) → T10 ✓. **K8** (0/14, Stub↔FIN, owner≠firma) → T3/T4 + owner-scoped Gates durchgängig ✓. **K9** (nicht `werkstatt_qr_pool`; token-basiert nicht NFC; ON-DELETE; partial-unique existiert) → T8/T9 + kein NFC-Write-Pfad angefasst ✓.
- **Bewusste Spec-Abweichungen (dokumentiert, Audit-Punkt 5):** (a) „Fahrzeug-Übersicht **statt** Fälle-Liste" → **additive** Nav („Fahrzeuge" neben „Meine Fälle") statt Entfernung der Fall-Liste — Grund: nur 7/23 Claims haben ein Fahrzeug (16 vehicle-lose Claims würden sonst unerreichbar). (b) `/kunde/faelle/[id]` = Legacy-Redirect **nur wenn** der Claim ein owned Fahrzeug hat, sonst in-place-Render — gleicher Grund + Redirect-Stub-Gate. (c) Owner-Writer liegt in `src/lib/vehicles/owner.ts` (fokussierte Datei) statt in `ensure-vehicle.ts` (FIN-zentrisch) — DRY/one-responsibility; Wiring am Account-Anlage-Punkt `finalizeKundeSetup` wie gefordert.
- **Nicht in P6** (gehört anderen Phasen): der Finder-Boost, der `netzwerk_owner_id` *liest* (P2); `profiles.netzwerk_owner_id`-Seed (P3); die P0-DDL selbst.
**2. Placeholder-Scan:** kein TBD/„handle edge cases" — alle Loader/Pages/Migration/Tests als vollständiger Code; Backfill-Owner-Resolution konkret (claim_parties→faelle-Fallback).
**3. Typ-Konsistenz:** `KundeFahrzeug`/`getKundeFahrzeuge` (T1) → T5/T6/T7 identisch; `FahrzeugSchaeden`/`ladeSchaedenFuerFahrzeug`/`getKundeFahrzeugSchaeden` (T2) → T6; `setVehicleOwnerFuerFall` (T3); `resolveNetzwerkOwnerFuerFlotte` (T10); `schadenHrefBase`-Prop (T6). `current_owner_id`/`karten_token`/`operative_status` durchgängig die verifizierten DB-Namen (nicht `.token`, nicht `.status` als Claim-Feld).
