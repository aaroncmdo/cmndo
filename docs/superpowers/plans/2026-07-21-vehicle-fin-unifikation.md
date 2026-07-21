# Vehicle-FIN-Unifikation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine `vehicles`-Row pro physischem Auto, durchgängig in Flotte/Lead/Claim: manuelle Flotten-Anlage wird FIN-fähig (A1), und ein FIN-Gewinn absorbiert einen vorherigen FIN-losen Stub über alle 10 FK-Tabellen (A2).

**Architecture:** A1 = kleine Verzweigung in `addFahrzeugToFlotte` (Muster wie ZB1-Pfad), kein DB-Change. A2 = eine atomare Postgres-RPC `merge_stub_vehicle` (Migration via Supabase-Plugin) + ein optionaler `supersedesVehicleId`-Trigger zentral in `ensureVehicleFromFin`, den die Claim/Lead-FIN-Call-Sites füttern.

**Tech Stack:** Next.js 15 Server Actions, Supabase (Postgres RPC, `AnyDb`-Cast), vitest (node-env), Supabase-Plugin (`apply_migration`).

## Global Constraints

- **Kein Fuzzy-Matching** — Merge nur contextual (Record liefert die Stub-id via `supersedesVehicleId`).
- **Kein Cardentity** in diesem Scope.
- **Migration NUR via Supabase-Plugin** `apply_migration` (Regel 2): apply → `list_migrations` (Version V ablesen) → File `supabase/migrations/<V>_merge_stub_vehicle_rpc.sql` committen (Name == V) → `execute_sql` READ verifizieren.
- **RPC atomar** (eine Transaktion), `SECURITY DEFINER`, `EXECUTE` nur `service_role`. Guards: stub.fin NULL, target.fin NOT NULL, stub≠target.
- **Trigger non-critical**: Merge-Fehler → `console.warn`, bricht OCR/FIN-Gewinnung nie.
- Server-Actions: Result-Object `{ ok, error? }`, kein `throw`. UI-Strings Deutsch mit Umlauten. `AnyDb`-Cast für `vehicles`/`schadenkarten`.
- **FIN-Validierung:** `VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/` (kanonisch aus `ensure-vehicle.ts`).
- Worktree: `.claude/worktrees/vehicle-fin-unifikation` (Branch `kitta/vehicle-fin-unifikation` aus `origin/staging`). Alle Pfade repo-relativ.
- **Vorab:** `npm ci` im Worktree (frischer Worktree hat kein `node_modules`).

---

### Task 1: A1 — `FahrzeugForm` + `addFahrzeugToFlotte` FIN-fähig

**Files:**
- Modify: `src/lib/kunde/firma-flotte.ts` (Type `FahrzeugForm`)
- Modify: `src/lib/vehicles/ensure-vehicle.ts:37` (`VIN_REGEX` exportieren)
- Modify: `src/lib/flotte/mutate-flotte.ts` (`addFahrzeugToFlotte`)
- Test: `src/lib/flotte/mutate-flotte.test.ts` (neu)

**Interfaces:**
- Consumes: `ensureVehicleFromFin`, `createVehicleStub`, `VIN_REGEX` (aus `ensure-vehicle.ts`), `bindeVehicleAnFlotte` (bestehend).
- Produces: `FahrzeugForm` mit `fin?/hsn?/tsn?`; `addFahrzeugToFlotte` routet gültige FIN über `ensureVehicleFromFin`.

- [ ] **Step 1: `VIN_REGEX` exportieren**

In `src/lib/vehicles/ensure-vehicle.ts` Zeile 37 `const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/` → `export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/`.

- [ ] **Step 2: `FahrzeugForm` erweitern**

In `src/lib/kunde/firma-flotte.ts` den Type ergänzen:

```ts
export type FahrzeugForm = {
  kennzeichen: string
  hersteller?: string
  modell?: string
  notiz?: string
  fin?: string
  hsn?: string
  tsn?: string
}
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/flotte/mutate-flotte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

const ensureMock = vi.fn()
const stubMock = vi.fn()
vi.mock('@/lib/vehicles/ensure-vehicle', () => ({
  ensureVehicleFromFin: (...a: unknown[]) => ensureMock(...a),
  createVehicleStub: (...a: unknown[]) => stubMock(...a),
  VIN_REGEX: /^[A-HJ-NPR-Z0-9]{17}$/,
}))

import { addFahrzeugToFlotte } from './mutate-flotte'

function dbWithBindOk() {
  // bindeVehicleAnFlotte macht .from('flotten_fahrzeuge').insert(...)
  return { from: () => ({ insert: async () => ({ error: null }) }) } as never
}

describe('addFahrzeugToFlotte FIN-Routing', () => {
  it('gültige FIN -> ensureVehicleFromFin (dedup), nicht Stub', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v-fin' })
    const res = await addFahrzeugToFlotte(dbWithBindOk(), 'f1', {
      kennzeichen: 'K-AB 123', fin: 'WVWZZZ1JZXW000001',
    }, 'u1')
    expect(res.ok).toBe(true)
    expect(ensureMock).toHaveBeenCalledTimes(1)
    expect(stubMock).not.toHaveBeenCalled()
  })

  it('keine/ungültige FIN -> createVehicleStub', async () => {
    stubMock.mockResolvedValue({ ok: true, vehicleId: 'v-stub' })
    const res = await addFahrzeugToFlotte(dbWithBindOk(), 'f1', {
      kennzeichen: 'K-AB 123', fin: 'ZU-KURZ',
    }, 'u1')
    expect(res.ok).toBe(true)
    expect(stubMock).toHaveBeenCalledTimes(1)
    expect(ensureMock).not.toHaveBeenCalled()
  })

  it('ohne Kennzeichen -> Fehler, kein Vehicle-Write', async () => {
    const res = await addFahrzeugToFlotte(dbWithBindOk(), 'f1', { kennzeichen: '  ' }, 'u1')
    expect(res.ok).toBe(false)
    expect(ensureMock).not.toHaveBeenCalled()
    expect(stubMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lib/flotte/mutate-flotte.test.ts`
Expected: FAIL (addFahrzeugToFlotte nutzt noch keinen FIN-Zweig → `ensureMock` nie gerufen).

- [ ] **Step 5: Implement**

In `src/lib/flotte/mutate-flotte.ts`: Import ergänzen und `addFahrzeugToFlotte` ersetzen:

```ts
import { createVehicleStub, ensureVehicleFromFin, VIN_REGEX } from '@/lib/vehicles/ensure-vehicle'
```

```ts
export async function addFahrzeugToFlotte(
  db: AnyDb, firmaId: string, form: FahrzeugForm, userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const kennzeichen = (form.kennzeichen ?? '').trim()
  if (!kennzeichen) return { ok: false, error: 'Bitte ein Kennzeichen angeben.' }

  const fin = form.fin?.trim().toUpperCase() || null
  const hatFin = !!fin && VIN_REGEX.test(fin)
  const snapshot = {
    kennzeichen,
    hersteller: form.hersteller?.trim() || null,
    modell: form.modell?.trim() || null,
    hsn: form.hsn?.trim() || null,
    tsn: form.tsn?.trim() || null,
  }
  // Muster wie zb1-batch-anlage.ts:65-68: mit FIN dedupliziert ensureVehicleFromFin, sonst Stub.
  const veh = hatFin
    ? await ensureVehicleFromFin({ fin: fin as string, snapshot, db })
    : await createVehicleStub({ snapshot, db })
  if (!veh.ok) return { ok: false, error: veh.error }

  const bind = await bindeVehicleAnFlotte(db, { firmaId, vehicleId: veh.vehicleId, userId, notiz: form.notiz })
  if (!bind.ok) return { ok: false, error: bind.bereitsVorhanden ? 'Dieses Fahrzeug ist bereits in der Flotte.' : bind.error }
  return { ok: true }
}
```

(Der alte Import `import { createVehicleStub } from '@/lib/vehicles/ensure-vehicle'` wird durch den kombinierten oben ersetzt.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/flotte/mutate-flotte.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add src/lib/kunde/firma-flotte.ts src/lib/vehicles/ensure-vehicle.ts src/lib/flotte/mutate-flotte.ts src/lib/flotte/mutate-flotte.test.ts
git commit -m "feat(flotte): manuelle Anlage FIN-faehig (dedup via ensureVehicleFromFin, Muster wie ZB1)"
```

---

### Task 2: A1 — FIN/HSN/TSN in beide Anlage-Formulare

**Files:**
- Modify: `src/components/flotte/FlotteClient.tsx` (Flottenmanager-Anlage)
- Modify: `src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx` (Admin-Anlage)
- Modify (falls nötig): `src/app/admin/vertrieb/_actions/firmen-flotte-fahrzeuge.ts` (`fuegeFahrzeugZuFlotteHinzu` muss `fin/hsn/tsn` durchreichen)

**Interfaces:**
- Consumes: `FahrzeugForm` (Task 1), `onFuegeHinzu`/`fuegeFahrzeugZuFlotteHinzu` (bestehend).

- [ ] **Step 1: FlotteClient — State + Reset erweitern**

In `src/components/flotte/FlotteClient.tsx`: `fzForm`-State (Zeile 43) und Reset (Zeile 62) je um `fin: '', hsn: '', tsn: ''` ergänzen:

```ts
const [fzForm, setFzForm] = useState({ kennzeichen: '', hersteller: '', modell: '', notiz: '', fin: '', hsn: '', tsn: '' })
```
```ts
setFzForm({ kennzeichen: '', hersteller: '', modell: '', notiz: '', fin: '', hsn: '', tsn: '' })
```

- [ ] **Step 2: FlotteClient — Felder ins Formular**

Direkt nach dem Modell-`TextField` (Zeile 184) einfügen:

```tsx
            <TextField label="FIN (optional)" value={fzForm.fin} onChange={(e) => setFzForm((p) => ({ ...p, fin: e.target.value }))} placeholder="17-stellig, z. B. WVWZZZ…" />
            <TextField label="HSN (optional)" value={fzForm.hsn} onChange={(e) => setFzForm((p) => ({ ...p, hsn: e.target.value }))} placeholder="z. B. 0603" />
            <TextField label="TSN (optional)" value={fzForm.tsn} onChange={(e) => setFzForm((p) => ({ ...p, tsn: e.target.value }))} placeholder="z. B. BGU" />
```

- [ ] **Step 3: Admin-Client — State + Felder + Übergabe**

In `FirmenFlotteDetailClient.tsx`: neben `kennzeichen/hersteller/modell/fzNotiz` (Zeilen 51-54) drei States `fin/hsn/tsn` (`useState('')`); je ein `TextField`/Input im Fahrzeug-Add-Block (analog Muster im File); und in `fahrzeugAnlegen` (Zeile 83-88) `fin: fin.trim() || undefined, hsn: hsn.trim() || undefined, tsn: tsn.trim() || undefined` an `fuegeFahrzeugZuFlotteHinzu` ergänzen + Reset nachziehen.

- [ ] **Step 4: Admin-Action Durchreichung prüfen**

In `src/app/admin/vertrieb/_actions/firmen-flotte-fahrzeuge.ts` sicherstellen, dass `fuegeFahrzeugZuFlotteHinzu` den `FahrzeugForm` (jetzt inkl. `fin/hsn/tsn`) **vollständig** an `addFahrzeugToFlotte` weiterreicht (nicht ein neu zusammengebautes Teil-Objekt). Falls es die Felder einzeln mappt: `fin/hsn/tsn` ergänzen.

- [ ] **Step 5: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/flotte/FlotteClient.tsx "src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx" src/app/admin/vertrieb/_actions/firmen-flotte-fahrzeuge.ts
git commit -m "feat(flotte): FIN/HSN/TSN optional in beide Fahrzeug-Anlage-Formulare"
```

---

### Task 3: A2 — `merge_stub_vehicle` RPC (Migration)

**Files:**
- Create: `supabase/migrations/<V>_merge_stub_vehicle_rpc.sql` (V vom Plugin)

**Interfaces:**
- Produces: RPC `public.merge_stub_vehicle(p_stub uuid, p_target uuid) RETURNS void`.

- [ ] **Step 1: schadenkarten-Status-CHECK verifizieren (READ)**

`execute_sql` (project `paizkjajbuxxksdoycev`):
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.schadenkarten'::regclass AND contype='c' AND conname ILIKE '%status%';
```
Erwartung: `'ersetzt'` ist im CHECK enthalten (sonst Migration anpassen — der Demote-Schritt braucht ihn).

- [ ] **Step 2: Migration anwenden (Plugin)**

`apply_migration({ name: 'merge_stub_vehicle_rpc', query: <DDL unten> })`:

```sql
CREATE OR REPLACE FUNCTION public.merge_stub_vehicle(p_stub uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_stub_fin text; v_target_fin text;
BEGIN
  IF p_stub = p_target THEN RAISE EXCEPTION 'merge_stub_vehicle: stub == target (%)', p_stub; END IF;
  SELECT fin INTO v_stub_fin FROM vehicles WHERE id = p_stub;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_stub_vehicle: stub % existiert nicht', p_stub; END IF;
  IF v_stub_fin IS NOT NULL THEN RAISE EXCEPTION 'merge_stub_vehicle: stub % hat FIN (kein Stub)', p_stub; END IF;
  SELECT fin INTO v_target_fin FROM vehicles WHERE id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_stub_vehicle: target % existiert nicht', p_target; END IF;
  IF v_target_fin IS NULL THEN RAISE EXCEPTION 'merge_stub_vehicle: target % ohne FIN', p_target; END IF;

  -- 6 Tabellen ohne vehicle_id-Unique: plain re-point
  UPDATE claims              SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE claim_parties       SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE claim_mietwagen     SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE leads               SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE repairs             SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE vehicle_vorschaeden SET vehicle_id = p_target WHERE vehicle_id = p_stub;

  -- UNIQUE(claim_id, vehicle_id): kollidierende Stub-Row loeschen, Rest umhaengen
  DELETE FROM claim_vehicle_involvements civ WHERE civ.vehicle_id = p_stub
    AND EXISTS (SELECT 1 FROM claim_vehicle_involvements t WHERE t.claim_id = civ.claim_id AND t.vehicle_id = p_target);
  UPDATE claim_vehicle_involvements SET vehicle_id = p_target WHERE vehicle_id = p_stub;

  -- UNIQUE(firma_id, vehicle_id): kollidierende Stub-Row loeschen, Rest umhaengen
  DELETE FROM flotten_fahrzeuge ff WHERE ff.vehicle_id = p_stub
    AND EXISTS (SELECT 1 FROM flotten_fahrzeuge t WHERE t.firma_id = ff.firma_id AND t.vehicle_id = p_target);
  UPDATE flotten_fahrzeuge SET vehicle_id = p_target WHERE vehicle_id = p_stub;

  -- partial UNIQUE(fahrzeug_id) WHERE status='gebunden': kollidierende 'gebunden'-Stubkarte demoten, dann umhaengen
  UPDATE schadenkarten SET status = 'ersetzt'
    WHERE fahrzeug_id = p_stub AND status = 'gebunden'
      AND EXISTS (SELECT 1 FROM schadenkarten t WHERE t.fahrzeug_id = p_target AND t.status = 'gebunden');
  UPDATE schadenkarten SET fahrzeug_id = p_target WHERE fahrzeug_id = p_stub;

  -- partial UNIQUE(vehicle_id) WHERE bis IS NULL: kollidierende aktive Stub-Row schliessen, dann umhaengen
  UPDATE vehicle_ownership_history SET bis = now()
    WHERE vehicle_id = p_stub AND bis IS NULL
      AND EXISTS (SELECT 1 FROM vehicle_ownership_history t WHERE t.vehicle_id = p_target AND t.bis IS NULL);
  UPDATE vehicle_ownership_history SET vehicle_id = p_target WHERE vehicle_id = p_stub;

  DELETE FROM vehicles WHERE id = p_stub;
END; $$;

REVOKE ALL ON FUNCTION public.merge_stub_vehicle(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_stub_vehicle(uuid, uuid) TO service_role;
```

- [ ] **Step 3: Getrackte Version ablesen + File committen**

`list_migrations` → Version `<V>` der eben applizierten Migration ablesen. Migration-File `supabase/migrations/<V>_merge_stub_vehicle_rpc.sql` mit **exakt dem DDL aus Step 2** anlegen (Dateiname == `<V>`).

```bash
git add supabase/migrations/*_merge_stub_vehicle_rpc.sql
git commit -m "feat(vehicles): merge_stub_vehicle RPC (re-point 10 FK-Tabellen + Stub-Delete, atomar)"
```

- [ ] **Step 4: Verify (READ)**

`execute_sql`:
```sql
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'merge_stub_vehicle';
```
Erwartung: eine Zeile, `prosecdef = true`.

- [ ] **Step 5: Types-Regen (Regel 2)**

Da die RPC nur über den **ungetypten** Admin-Client (`AnyDb`) gerufen wird, referenziert **kein** TS-Code den Functions-Type → kein tsc-/query-drift-Impact. Regen daher optional; falls gefahren: `SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts` + committen. Sonst im PR vermerken „function-only, kein Consumer-Type".

---

### Task 4: A2 — `ensureVehicleFromFin` Stub-Absorb-Trigger

**Files:**
- Modify: `src/lib/vehicles/ensure-vehicle.ts` (`ensureVehicleFromFin`)
- Test: `src/lib/vehicles/ensure-vehicle.test.ts` (neu oder bestehend erweitern)

**Interfaces:**
- Consumes: RPC `merge_stub_vehicle` (Task 3).
- Produces: `ensureVehicleFromFin(params: { fin, snapshot?, ownerId?, db, supersedesVehicleId? })` — neuer optionaler `supersedesVehicleId?: string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/vehicles/ensure-vehicle.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ensureVehicleFromFin } from './ensure-vehicle'

const FIN = 'WVWZZZ1JZXW000001'

function makeDb(opts: { stubFin: string | null }) {
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const db = {
    rpc,
    from: (table: string) => ({
      // upsert_vehicle_by_fin laeuft ueber .rpc; from('vehicles') wird fuer den
      // supersedes-Lookup (.select('fin').eq('id').maybeSingle()) UND den Snapshot-UPDATE genutzt.
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { fin: opts.stubFin }, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  } as never
  // Die eigentliche upsert-RPC gibt die Ziel-UUID zurueck:
  rpc.mockImplementation(async (fn: string) =>
    fn === 'upsert_vehicle_by_fin' ? { data: 'v-target', error: null } : { data: null, error: null },
  )
  return { db, rpc }
}

describe('ensureVehicleFromFin supersedes-Merge', () => {
  it('supersedes ist ein Stub (fin NULL) und != target -> merge_stub_vehicle gerufen', async () => {
    const { db, rpc } = makeDb({ stubFin: null })
    const res = await ensureVehicleFromFin({ fin: FIN, db, supersedesVehicleId: 'v-stub' })
    expect(res.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('merge_stub_vehicle', { p_stub: 'v-stub', p_target: 'v-target' })
  })

  it('supersedes hat eine FIN (kein Stub) -> KEIN Merge', async () => {
    const { db, rpc } = makeDb({ stubFin: 'SOMEOTHERFIN00001' })
    await ensureVehicleFromFin({ fin: FIN, db, supersedesVehicleId: 'v-real' })
    expect(rpc).not.toHaveBeenCalledWith('merge_stub_vehicle', expect.anything())
  })

  it('supersedes == target -> KEIN Merge', async () => {
    const { db, rpc } = makeDb({ stubFin: null })
    await ensureVehicleFromFin({ fin: FIN, db, supersedesVehicleId: 'v-target' })
    expect(rpc).not.toHaveBeenCalledWith('merge_stub_vehicle', expect.anything())
  })

  it('kein supersedes -> KEIN Merge', async () => {
    const { db, rpc } = makeDb({ stubFin: null })
    await ensureVehicleFromFin({ fin: FIN, db })
    expect(rpc).not.toHaveBeenCalledWith('merge_stub_vehicle', expect.anything())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vehicles/ensure-vehicle.test.ts`
Expected: FAIL (Parameter/Merge existiert noch nicht).

- [ ] **Step 3: Implement**

In `src/lib/vehicles/ensure-vehicle.ts`, `ensureVehicleFromFin`-Signatur um `supersedesVehicleId?: string` erweitern:

```ts
export async function ensureVehicleFromFin(params: {
  fin: string | null | undefined
  snapshot?: VehicleSnapshot
  ownerId?: string | null
  db: SupabaseClient
  supersedesVehicleId?: string
}): Promise<EnsureVehicleResult> {
```

Direkt **vor** dem finalen `return { ok: true, vehicleId }` (nach dem CMM-50.1-Secondary-UPDATE) einfügen:

```ts
  // Vehicle-Unifikation: hing der aufrufende Record vorher an einem FIN-losen Stub (!= dieser
  // FIN-Row), alle Referenzen auf den Stub umhaengen + Stub loeschen. Non-critical.
  if (params.supersedesVehicleId && params.supersedesVehicleId !== vehicleId) {
    const { data: alt } = await params.db
      .from('vehicles').select('fin').eq('id', params.supersedesVehicleId).maybeSingle()
    if (alt && (alt as { fin: string | null }).fin === null) {
      const { error: mergeErr } = await params.db.rpc('merge_stub_vehicle', {
        p_stub: params.supersedesVehicleId, p_target: vehicleId,
      })
      if (mergeErr) console.warn('[vehicle-unifikation] merge_stub_vehicle:', mergeErr.message)
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vehicles/ensure-vehicle.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles/ensure-vehicle.ts src/lib/vehicles/ensure-vehicle.test.ts
git commit -m "feat(vehicles): ensureVehicleFromFin supersedesVehicleId -> Stub-Absorb via merge_stub_vehicle"
```

---

### Task 5: A2 — Claim-FIN-Trigger-Sites füttern

**Files:**
- Modify: `src/app/api/ocr-fahrzeugschein/route.ts:116-122`
- Modify: `src/app/faelle/[id]/_actions/stammdaten.ts:~736` (FIN-Save-Pfad)
- Modify: `src/app/upload/zb1/[token]/actions.ts:~171`

**Interfaces:**
- Consumes: `ensureVehicleFromFin({..., supersedesVehicleId})` (Task 4).

- [ ] **Step 1: ocr-fahrzeugschein — supersedes durchreichen**

In `src/app/api/ocr-fahrzeugschein/route.ts` den `if (extracted.fin_vin)`-Zweig (Zeile 116) so ändern, dass das aktuelle Claim-Fahrzeug vor dem Ensure gelesen und als `supersedesVehicleId` übergeben wird:

```ts
        if (extracted.fin_vin) {
          const { data: claimRow } = await vehDb.from('claims').select('vehicle_id').eq('id', claimId).maybeSingle()
          const altesFahrzeug = (claimRow?.vehicle_id as string | null) ?? null
          const veh = await ensureVehicleFromFin({ fin: extracted.fin_vin, snapshot: vehSnapshot, db: vehDb, supersedesVehicleId: altesFahrzeug ?? undefined })
          if (veh.ok) {
            await vehDb.from('claims').update({ vehicle_id: veh.vehicleId }).eq('id', claimId)
          } else {
            console.warn('[CMM-68] OCR vehicles (FIN):', veh.error)
          }
        } else {
```

- [ ] **Step 2: Die anderen zwei Primär-Sites analog**

In `faelle/[id]/_actions/stammdaten.ts` (FIN-Save, ~Zeile 736) und `upload/zb1/[token]/actions.ts` (~Zeile 171): **exakt dasselbe Muster** — das aktuelle `claims.vehicle_id` (bzw. `leads.vehicle_id` je nach Kontext) direkt vor dem `ensureVehicleFromFin`-Aufruf lesen und als `supersedesVehicleId` durchreichen. Die restlichen Sites (`flow`, `gutachter/fall`, `vor-ort`, `admin/faelle/anlegen`, `cardentity/run-full`, `ocr-gutachten`) bleiben Boy-Scout (im PR vermerken, kein stiller Cap).

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/ocr-fahrzeugschein/route.ts" "src/app/faelle/[id]/_actions/stammdaten.ts" "src/app/upload/zb1/[token]/actions.ts"
git commit -m "feat(vehicles): Claim-FIN-Trigger-Sites reichen supersedesVehicleId durch (Stub-Absorb)"
```

---

### Task 6: Vollverifikation + RPC-Fixture-Smoke

**Files:** keine.

- [ ] **Step 1: Unit-Tests**

Run: `npx vitest run src/lib/flotte/mutate-flotte.test.ts src/lib/vehicles/ensure-vehicle.test.ts`
Expected: PASS.

- [ ] **Step 2: Build + Ratchets**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün.
Run: `npm run check:token-audit && npm run check:component-set -- --ratchet && npm run check:knip -- --ratchet && npm run check:vitest -- --ratchet` → keine NEUEN Verletzer. (Bei `component-set`: die neuen `TextField` sind sanktioniert; rohe Admin-Inputs = wie Bestand.) `check:rls-policies -- --ratchet` (SQL-Diff da Migration) → die RPC ist kein `CREATE POLICY`, sollte grün sein.

- [ ] **Step 3: RPC-Fixture-Smoke (execute_sql, KEINE echten Kundendaten)**

Ein selbst angelegtes Test-Trio anlegen + mergen + assert + aufräumen. `execute_sql` (ein Statement-Block):
```sql
DO $$
DECLARE s uuid; t uuid; f uuid;
BEGIN
  INSERT INTO vehicles(kennzeichen_aktuell, fin) VALUES ('TEST-STUB', NULL) RETURNING id INTO s;
  INSERT INTO vehicles(kennzeichen_aktuell, fin) VALUES ('TEST-FIN', 'TESTFIN0000000001') RETURNING id INTO t;
  INSERT INTO firmen(name) VALUES ('TEST-MERGE-FIRMA') RETURNING id INTO f;
  INSERT INTO flotten_fahrzeuge(firma_id, vehicle_id) VALUES (f, s);
  PERFORM merge_stub_vehicle(s, t);
  ASSERT (SELECT count(*) FROM vehicles WHERE id = s) = 0, 'Stub nicht geloescht';
  ASSERT (SELECT vehicle_id FROM flotten_fahrzeuge WHERE firma_id = f) = t, 'flotten_fahrzeuge nicht umgehaengt';
  DELETE FROM flotten_fahrzeuge WHERE firma_id = f;
  DELETE FROM firmen WHERE id = f;
  DELETE FROM vehicles WHERE id = t;
  RAISE NOTICE 'RPC-Smoke OK';
END $$;
```
Erwartung: „RPC-Smoke OK", kein ASSERT-Fehler. (Nach dem Lauf sind alle Test-Rows entfernt.)

- [ ] **Step 4: Push + PR gegen `staging`**

```bash
git push -u origin kitta/vehicle-fin-unifikation:kitta/vehicle-fin-unifikation
gh pr create --base staging --head kitta/vehicle-fin-unifikation --title "feat(vehicles): FIN-Unifikation (A1 manuelle Anlage FIN-faehig + A2 Stub-Merge)" --body "<Zusammenfassung + Audit + Regel-4-Smoke-Plan>"
```

- [ ] **Step 5: Regel 4 — Prod-Smoke (nach Deploy, Test-Konto)**

A1: manuelle Flotten-Anlage mit gültiger FIN → Fahrzeug erscheint, `vehicles`-Row hat die FIN (nicht Stub). A2: einen Claim mit Flotten-Stub-Fahrzeug per ZB1-OCR eine FIN geben → danach zeigen `flotten_fahrzeuge` **und** der Claim auf **eine** `vehicles`-Row (Live-DB-Verifikation). Ergebnis im PR/Marker dokumentieren; offen bis grün.

---

## Self-Review (gegen die Spec)

**Spec-Coverage:** A1 (FahrzeugForm+Routing) → Task 1; A1-UI → Task 2. A2-RPC (10 Tabellen, 4 Unique-Fälle) → Task 3. A2-Trigger (`supersedesVehicleId`, contextual, Stub-Guard) → Task 4. Claim-FIN-Sites → Task 5. Tests (A1-Verzweigung, A2-Guard, RPC-Fixture, Regel-4) → Task 1/4/6. Cardentity/Fuzzy raus → nicht implementiert (korrekt). ✓

**Placeholder-Scan:** Task 2 Step 3/4 + Task 5 Step 2 beschreiben eine **uniforme** Transformation mit exaktem Muster + Ziel-Files/Zeilen (Task 5 Step 1 zeigt den vollen Beispiel-Diff); kein „TODO". Task 3 `<V>` = die vom Plugin vergebene Version (bewusst nicht geraten, Regel-2-Pflicht).

**Typ-Konsistenz:** `FahrzeugForm.fin/hsn/tsn` (Task 1) = genutzt in Task 2-UI. `VIN_REGEX`-Export (Task 1) = importiert in `mutate-flotte`. `ensureVehicleFromFin({...supersedesVehicleId})` (Task 4) = gerufen in Task 5. RPC `merge_stub_vehicle(p_stub,p_target)` (Task 3) = gerufen in Task 4 mit exakt `{ p_stub, p_target }`.

## Out of Scope
Cardentity; ZB1-Pfad (schon korrekt); Fuzzy-Kennzeichen-Match; globaler Alt-Stub-Backfill (separater Datenlauf); Sub-Projekt B (Foto-Zustandsdoku).
