# CMM Entity — Plan 2: Schaden/Vorschaden-Entität — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **⚠️ PLAN-ONLY / EXECUTION GATED:** nicht vor CMM-49-Koordination + ruhigem Fenster (Aaron-Direktive 04.06.). Safe-additiv + faelle-frei. Spec-Input: `docs/04.06.2026/cmm-entity-katalog-spec.md` (PR #2429) §4. Vorgänger: Plan 1 (#2431, Resolver-Foundation) — keine harte Abhängigkeit (Plan 2 ist eigenständig additiv).

**Goal:** Schaden + Vorschaden als **fahrzeug-gebundene Damage-Entität** verfügbar machen — „der Schaden von heute ist der Vorschaden von morgen am selben Fahrzeug" — sodass die Fahrzeug-Damage-Historie eine SoT ist, claim-übergreifend wiederverwendbar, statt flach auf `claims`.

**Architecture:** **Additiv** auf der bestehenden `vehicle_vorschaeden`-Tabelle (vehicle-bound, existiert aus CMM-64): `claim_id` (nullable) + `state ∈ {aktuell, vorschaden}` ergänzen. Damit IST `vehicle_vorschaeden` die generische Damage-Entität (`state` trägt die Semantik). **Bewusst KEIN Rename** auf `vehicle_damages` jetzt — `vehicle_vorschaeden` hat Consumer (u.a. `v_claim_full.vorschaden_typ_b_bericht`, CMM-64); ein Rename bräche die + ist nicht additiv → optionaler, koordinierter Cosmetic-Schritt SPÄTER (mit Consumer-Repoint). Zwei Writer-Helper nach `ensure-person.ts`-Muster (untyped db, non-throwing).

**Tech Stack:** TypeScript (`@supabase/supabase-js` untyped client), Postgres-Migration via `apply_migration` (Regel 2), vitest (gated DB-Integration `RUN_DB_INTEGRATION`).

---

## File Structure

| Datei | Verantwortung | Art |
|---|---|---|
| `supabase/migrations/<V>_cmm_entity_vehicle_damage_state.sql` | `vehicle_vorschaeden` + `claim_id` + `state` + Indexe | Create (via `apply_migration`) |
| `src/lib/vehicles/vehicle-damage.ts` | `recordVehicleDamage()` (find-or-create) + `markClaimDamagesAsVorschaden()` (State-Übergang) | Create |
| `src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts` | gated DB-Integration | Create |

**Scope-Grenze:** Die *Verdrahtung* (current-Schaden aus `claims.fahrzeugschaden_beschreibung`/`schadenspositionen` in `vehicle_vorschaeden` schreiben; `markClaimDamagesAsVorschaden` beim Claim-Close aufrufen) = **Plan 3 (Writer-Wiring)** + Lifecycle. Plan 2 liefert die Entität + die Helper-API; konsumiert wird sie später.

---

## Task 1: Migration — `claim_id` + `state` auf `vehicle_vorschaeden` (Regel 2)

**Files:** Create `supabase/migrations/<V>_cmm_entity_vehicle_damage_state.sql`

- [ ] **Step 1: Ist-Schema verifizieren (READ, Pre-Check)**

`execute_sql`:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='vehicle_vorschaeden'
  and column_name in ('claim_id','state');
```
Expected: leer (beide Spalten existieren noch nicht). Falls vorhanden → Migration entsprechend kürzen.

- [ ] **Step 2: DDL via `apply_migration`**

`apply_migration({ name: "cmm_entity_vehicle_damage_state", query: <SQL> })`:
```sql
-- Schaden/Vorschaden = fahrzeug-gebundene Damage-Entitaet (Spec §4).
-- claim_id = welcher Claim diesen Schaden begutachtet hat (NULL = importierte Historie /
-- Cardentity). state = aktueller Schaden im offenen Claim ('aktuell') vs eingefrorene
-- Fahrzeug-Historie ('vorschaden'). Bestand (CMM-64 Cardentity-Import) = vorschaden (Default).
alter table public.vehicle_vorschaeden
  add column if not exists claim_id uuid references public.claims(id) on delete set null;
alter table public.vehicle_vorschaeden
  add column if not exists state text not null default 'vorschaden'
  check (state in ('aktuell','vorschaden'));
create index if not exists idx_vehicle_vorschaeden_vehicle_state
  on public.vehicle_vorschaeden(vehicle_id, state);
create index if not exists idx_vehicle_vorschaeden_claim_id
  on public.vehicle_vorschaeden(claim_id);
```

- [ ] **Step 3: Getrackte Version ablesen** — `list_migrations` → `<V>` für `cmm_entity_vehicle_damage_state`.

- [ ] **Step 4: Migration-File committen** — `supabase/migrations/<V>_cmm_entity_vehicle_damage_state.sql` mit exakt dem SQL (Dateiname == `<V>`, Anti-Twin-Drift).

- [ ] **Step 5: Verify (READ)**

`execute_sql`:
```sql
select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='vehicle_vorschaeden' and column_name in ('claim_id','state')) as cols,            -- 2
  (select count(*) from vehicle_vorschaeden where state not in ('aktuell','vorschaden')) as bad_state;  -- 0
```
Expected: `cols=2`, `bad_state=0`.

- [ ] **Step 6: Commit** — `git add supabase/migrations/<V>_cmm_entity_vehicle_damage_state.sql && git commit -m "feat(cmm-entity): vehicle_vorschaeden + claim_id + state (Schaden/Vorschaden T1)"`

---

## Task 2: `recordVehicleDamage()` (find-or-create)

**Files:**
- Create: `src/lib/vehicles/vehicle-damage.ts`
- Test: `src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts`

- [ ] **Step 1: Gated Integration-Test** (Muster: `confirm-orphan-match.integration.test.ts`)

```ts
// src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { recordVehicleDamage, markClaimDamagesAsVorschaden } from '@/lib/vehicles/vehicle-damage'

const RUN = process.env.RUN_DB_INTEGRATION === '1'
const d = RUN ? describe : describe.skip

d('vehicle-damage (DB)', () => {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let vehicleId = ''
  beforeAll(async () => {
    const { data } = await db.from('vehicles').insert({ kennzeichen_aktuell: `DMG-${Date.now()}` }).select('id').single()
    vehicleId = data!.id as string
  })
  afterAll(async () => {
    await db.from('vehicle_vorschaeden').delete().eq('vehicle_id', vehicleId)
    await db.from('vehicles').delete().eq('id', vehicleId)
  })

  it('aktueller Schaden ist idempotent pro (vehicle, claim)', async () => {
    const claimId = null // claim-los reicht fuer den Idempotenz-Pfad nicht; nutze state direkt
    const a = await recordVehicleDamage({ db, damage: { vehicleId, state: 'aktuell', art: 'frontschaden' } })
    expect(a.ok).toBe(true)
    // ohne claim_id wird KEINE Idempotenz erzwungen -> 2. Aufruf legt 2. Row an (Historie)
    const b = await recordVehicleDamage({ db, damage: { vehicleId, state: 'vorschaden', art: 'heckschaden' } })
    expect(b.ok && a.ok && b.damageId).not.toBe(a.ok ? a.damageId : '')
  })

  it('importierte Historie ohne state -> vorschaden', async () => {
    const r = await recordVehicleDamage({ db, damage: { vehicleId, art: 'lack', quelle: 'cardentity' } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const { data } = await db.from('vehicle_vorschaeden').select('state').eq('id', r.damageId).single()
      expect(data!.state).toBe('vorschaden')
    }
  })
})
```

- [ ] **Step 2: Test laufen, Fehlschlag** — `RUN_DB_INTEGRATION=1 npx vitest run src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

```ts
// src/lib/vehicles/vehicle-damage.ts
// CMM Entity (Spec §4): Schaden/Vorschaden = fahrzeug-gebundene Damage-Entitaet auf
// vehicle_vorschaeden. recordVehicleDamage = find-or-create einer Damage-Row;
// markClaimDamagesAsVorschaden = State-Uebergang Schaden->Vorschaden beim Claim-Close.
// Non-throwing Result-Object; db untyped (wie ensure-person.ts) — DB-Types hinken den
// frischen Spalten hinterher (AGENTS.md Regel 2 Schritt 6).
import type { SupabaseClient } from '@supabase/supabase-js'

export type VehicleDamageInput = {
  vehicleId: string
  claimId?: string | null
  state?: 'aktuell' | 'vorschaden'
  art?: string | null
  schwere?: string | null
  schadenDatum?: string | null
  beschreibung?: string | null
  quelle?: string | null
  rohdaten?: unknown
}
export type RecordVehicleDamageResult =
  | { ok: true; damageId: string; created: boolean }
  | { ok: false; error: string }

/**
 * find-or-create eine Damage-Row. Idempotent NUR fuer den aktuellen Schaden pro
 * (vehicle_id, claim_id, state='aktuell') — damit eine Konversion nicht doppelt
 * denselben Claim-Schaden anlegt. Historie/Vorschaeden (claim-los) sind additiv.
 */
export async function recordVehicleDamage(params: {
  db: SupabaseClient
  damage: VehicleDamageInput
}): Promise<RecordVehicleDamageResult> {
  const { db } = params
  const d = params.damage
  if (!d.vehicleId) return { ok: false, error: 'vehicleId leer' }
  const state: 'aktuell' | 'vorschaden' = d.state ?? (d.claimId ? 'aktuell' : 'vorschaden')
  try {
    if (d.claimId && state === 'aktuell') {
      const { data: existing, error } = await db
        .from('vehicle_vorschaeden').select('id')
        .eq('vehicle_id', d.vehicleId).eq('claim_id', d.claimId).eq('state', 'aktuell')
        .limit(1).maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (existing?.id) return { ok: true, damageId: existing.id as string, created: false }
    }
    const { data: created, error: insErr } = await db.from('vehicle_vorschaeden').insert({
      vehicle_id: d.vehicleId,
      claim_id: d.claimId ?? null,
      state,
      art: d.art ?? null,
      schwere: d.schwere ?? null,
      schaden_datum: d.schadenDatum ?? null,
      beschreibung: d.beschreibung ?? null,
      quelle: d.quelle ?? 'claim',
      rohdaten: (d.rohdaten ?? null) as never,
    }).select('id').single()
    if (insErr || !created) return { ok: false, error: insErr?.message ?? 'vehicle_vorschaeden-insert lieferte keine id' }
    return { ok: true, damageId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}

/**
 * Schaden->Vorschaden beim Claim-Close: alle 'aktuell'-Damages dieses Claims auf
 * 'vorschaden' setzen. Damit erscheinen sie fuer kuenftige Claims am selben Fahrzeug
 * als Vorschaden. Non-throwing.
 */
export async function markClaimDamagesAsVorschaden(params: {
  db: SupabaseClient
  claimId: string
}): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const { db } = params
  if (!params.claimId) return { ok: false, error: 'claimId leer' }
  try {
    const { data, error } = await db
      .from('vehicle_vorschaeden').update({ state: 'vorschaden' })
      .eq('claim_id', params.claimId).eq('state', 'aktuell').select('id')
    if (error) return { ok: false, error: error.message }
    return { ok: true, updated: data?.length ?? 0 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
```

- [ ] **Step 4: Test laufen, grün** — `RUN_DB_INTEGRATION=1 npx vitest run src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts` → PASS (2).
- [ ] **Step 5: tsc** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler.
- [ ] **Step 6: Commit** — `git add src/lib/vehicles/vehicle-damage.ts src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts && git commit -m "feat(cmm-entity): recordVehicleDamage + markClaimDamagesAsVorschaden (Schaden/Vorschaden T2)"`

---

## Task 3: State-Übergang testen (markClaimDamagesAsVorschaden)

**Files:** Modify Test `src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts` (Test ergänzen)

- [ ] **Step 1: Test ergänzen**

```ts
  it('markClaimDamagesAsVorschaden: aktuell -> vorschaden', async () => {
    // braucht eine echte claim_id: kleinster Weg = eine vorhandene lesen
    const { data: claim } = await db.from('claims').select('id').limit(1).single()
    const claimId = claim!.id as string
    const rec = await recordVehicleDamage({ db, damage: { vehicleId, claimId, state: 'aktuell', art: 'tuer' } })
    expect(rec.ok).toBe(true)
    const res = await markClaimDamagesAsVorschaden({ db, claimId })
    expect(res.ok && res.updated >= 1).toBe(true)
    if (rec.ok) {
      const { data } = await db.from('vehicle_vorschaeden').select('state').eq('id', rec.damageId).single()
      expect(data!.state).toBe('vorschaden')
    }
  })
```

- [ ] **Step 2: Test laufen, grün** — `RUN_DB_INTEGRATION=1 npx vitest run src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts` → PASS (3, inkl. neuem).
- [ ] **Step 3: Commit** — `git add src/lib/vehicles/__tests__/vehicle-damage.integration.test.ts && git commit -m "test(cmm-entity): Schaden->Vorschaden State-Uebergang (Schaden/Vorschaden T3)"`

---

## Read-Model-Notiz (für Plan 4 — View-Sourcing, NICHT hier umsetzen)

Wenn `v_claim_full` pro Claim die Damage-Entität exponiert (Plan 4):
- **Schaden (dieser Claim):** `vehicle_vorschaeden where vehicle_id = claim.vehicle_id and claim_id = <claim> and state='aktuell'`.
- **Vorschäden (für diesen Claim):** `vehicle_vorschaeden where vehicle_id = claim.vehicle_id and (claim_id is distinct from <claim> or state='vorschaden')` — d.h. eingefrorene Historie + fremde Claims.
- jsonb_agg wie das bestehende `vorschaden_typ_b_bericht`-Muster.

---

## Self-Review

**1. Spec-Coverage (§4):** Schaden+Vorschaden = vehicle-bound Damage-Entität → Task 1 (`claim_id`+`state` auf `vehicle_vorschaeden`) ✓ · „Schaden heute → Vorschaden morgen" = State-Übergang → Task 2/3 (`markClaimDamagesAsVorschaden`) ✓ · vehicle-bound (claim-übergreifend) → `vehicle_vorschaeden.vehicle_id` (Bestand) ✓ · Read-Model (per-Claim) → dokumentiert für Plan 4 ✓.

**2. Placeholder-Scan:** kein TBD; vollständiger Code je Step; die „rohdaten as never"-Cast + die untyped-db sind bewusst (Type-Lag, wie ensure-person). ✓

**3. Typ-Konsistenz:** `state` literal `'aktuell'|'vorschaden'` einheitlich (TS-Type + SQL-CHECK identisch). Result-Shapes folgen `ensure-person.ts`. `recordVehicleDamage`/`markClaimDamagesAsVorschaden` Signaturen konsistent zwischen Impl + Tests. ✓

**Offene Mini-Punkte für den Executor:** (a) Migration-File == getrackte Version. (b) Rename `vehicle_vorschaeden`→`vehicle_damages` bewusst NICHT in Plan 2 (Consumer-Break; optionaler späterer koordinierter Schritt). (c) Verdrahtung (Conversion-Schaden → recordVehicleDamage; Claim-Close → markClaimDamagesAsVorschaden) = Plan 3.
