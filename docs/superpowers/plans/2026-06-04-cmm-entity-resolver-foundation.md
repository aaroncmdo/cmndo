# CMM Entity — Plan 1: Resolver-Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **⚠️ PLAN-ONLY / EXECUTION GATED:** NICHT vor CMM-49-Koordination + ruhigem aar-939-Fenster ausführen (Aaron-Direktive 04.06.). Dieser Plan ist safe-additiv + faelle-frei, kollidiert mit nichts — aber Ausführung erst auf Go. Spec-Input: `docs/04.06.2026/cmm-entity-katalog-spec.md` (PR #2429) §1/§2/§5.

**Goal:** Die dedupenden `ensure<Entity>`-Resolver + ihre `normalized_name`-Schlüssel-Spalten anlegen, damit jeder spätere Writer eine Entität *find-or-create* (eine SoT pro realem Ding, keine Dupes) statt flach-per-Claim schreibt.

**Architecture:** Pro Org-Entität eine `normalized_name`-Spalte + Index; ein gemeinsames `normalizeName()`-Util (TS) mit **bit-identischem SQL-Pendant** (Backfill); je ein `ensure<Entity>`-Modul nach dem Muster von `src/lib/personen/ensure-person.ts` (untyped `db`, find-or-create, non-throwing Result-Object). Additiv — kein Reader/Writer wird hier verdrahtet (das ist Plan 3).

**Tech Stack:** TypeScript, Supabase (`@supabase/supabase-js` untyped client), Postgres-Migration via `apply_migration` (Regel 2), vitest (Unit + gated DB-Integration `RUN_DB_INTEGRATION`).

---

## File Structure

| Datei | Verantwortung | Art |
|---|---|---|
| `src/lib/entities/normalize.ts` | `normalizeName()` — kanonischer Dedup-Key (eine Quelle) | Create |
| `src/lib/entities/__tests__/normalize.test.ts` | Unit-Tests `normalizeName` | Create |
| `supabase/migrations/<V>_cmm_entity_resolver_foundation.sql` | `normalized_name`-Spalten + Indexe + `firmen.ansprechpartner_person_id` + `claim_parties.rolle += 'ansprechpartner'` + Backfill | Create (via `apply_migration`) |
| `src/lib/firmen/ensure-firma.ts` | `ensureFirma()` find-or-create (ust_id / normalized_name) | Create |
| `src/lib/firmen/__tests__/ensure-firma.integration.test.ts` | gated DB-Integration | Create |
| `src/lib/versicherungen/ensure-versicherung.ts` | `ensureVersicherung()` find-or-create (normalized_name) | Create |
| `src/lib/versicherungen/__tests__/ensure-versicherung.integration.test.ts` | gated DB-Integration | Create |
| `src/lib/vehicles/ensure-vehicle-from-kennzeichen.ts` | `ensureVehicleFromKennzeichen()` find-or-create (provisorisch, FIN-los) | Create |
| `src/lib/vehicles/__tests__/ensure-vehicle-from-kennzeichen.integration.test.ts` | gated DB-Integration | Create |

**Scope-Grenze:** `ensureWerkstatt`/`ensureMietwagen` sind erst in der Claim-Lifecycle (nicht Konvertierung) relevant → eigener Mikro-Plan später (identisches Muster zu `ensureFirma`). Hier NICHT.

---

## Task 1: `normalizeName()` Util (TDD)

**Files:**
- Create: `src/lib/entities/normalize.ts`
- Test: `src/lib/entities/__tests__/normalize.test.ts`

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/entities/__tests__/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeName } from '@/lib/entities/normalize'

describe('normalizeName', () => {
  it('lowercased + trimmed + Whitespace kollabiert', () => {
    expect(normalizeName('  HUK   Coburg ')).toBe('huk coburg')
  })
  it('Separatoren (-_/.,) werden zu Space normalisiert', () => {
    expect(normalizeName('HUK-Coburg')).toBe('huk coburg')
    expect(normalizeName('Müller, K.G.')).toBe('müller k g')
  })
  it('verschiedene Firmen bleiben verschieden (kein Suffix-Stripping)', () => {
    expect(normalizeName('HUK')).not.toBe(normalizeName('HUK Coburg'))
    expect(normalizeName('Meier GmbH')).not.toBe(normalizeName('Meier AG'))
  })
  it('leer/nullish -> null', () => {
    expect(normalizeName('   ')).toBeNull()
    expect(normalizeName(null)).toBeNull()
    expect(normalizeName(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen, Fehlschlag bestätigen**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/lib/entities/__tests__/normalize.test.ts`
Expected: FAIL — "Cannot find module '@/lib/entities/normalize'".

- [ ] **Step 3: Implementierung**

```ts
// src/lib/entities/normalize.ts
// CMM Entity Resolver-Foundation: kanonischer Dedup-Key fuer Org-/Namens-Resolver.
// EINE Quelle, damit "HUK-Coburg" / "HUK Coburg" / "huk  coburg" denselben Key ergeben
// (aber "HUK" allein NICHT). BEWUSST kein Rechtsform-Suffix-Stripping (GmbH/AG) — das
// wuerde verschiedene Firmen ueber-mergen. ⚠️ Das SQL-Backfill in der Migration (Task 2)
// MUSS bit-identisch normalisieren, sonst verfehlt find-or-create bestehende Rows.

/** lowercase · Separatoren (._/-,) -> Space · Whitespace kollabiert · trim. Leer -> null. */
export function normalizeName(input: string | null | undefined): string | null {
  if (input == null) return null
  const s = String(input)
    .toLowerCase()
    .replace(/[._/\-,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > 0 ? s : null
}
```

- [ ] **Step 4: Test laufen, grün bestätigen**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/lib/entities/__tests__/normalize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/entities/normalize.ts src/lib/entities/__tests__/normalize.test.ts
git commit -m "feat(cmm-entity): normalizeName() Dedup-Key-Util (Resolver-Foundation T1)"
```

---

## Task 2: Migration — normalized_name-Spalten + Indexe + ansprechpartner + rolle-CHECK (Regel 2)

**Files:**
- Create: `supabase/migrations/<V>_cmm_entity_resolver_foundation.sql` (`<V>` = vom Plugin vergebene Version, Schritt 3+4)

- [ ] **Step 1: DDL via `apply_migration` anwenden**

`apply_migration({ name: "cmm_entity_resolver_foundation", query: <SQL> })` mit:

```sql
-- normalized_name Dedup-Keys (additiv)
alter table public.firmen               add column if not exists normalized_name text;
alter table public.versicherungen       add column if not exists normalized_name text;
alter table public.werkstaetten         add column if not exists normalized_name text;
alter table public.mietwagenunternehmen add column if not exists normalized_name text;
alter table public.vehicles             add column if not exists kennzeichen_normalized text;

-- Firma -> Default-Ansprechpartner (stehende Beziehung, claim-unabhaengig)
alter table public.firmen add column if not exists ansprechpartner_person_id uuid
  references public.personen(id) on delete set null;

-- Backfill: normalized_name fuer Bestand. ⚠️ MUSS normalizeName() (TS) exakt spiegeln:
--   lower -> [._/-,]+ -> ' ' -> \s+ -> ' ' -> btrim ; '' -> NULL
update public.versicherungen set normalized_name =
  nullif(btrim(regexp_replace(regexp_replace(lower(name), '[._/,-]+', ' ', 'g'), '\s+', ' ', 'g')), '')
  where normalized_name is null and name is not null;
update public.firmen set normalized_name =
  nullif(btrim(regexp_replace(regexp_replace(lower(name), '[._/,-]+', ' ', 'g'), '\s+', ' ', 'g')), '')
  where normalized_name is null and name is not null;
update public.werkstaetten set normalized_name =
  nullif(btrim(regexp_replace(regexp_replace(lower(name), '[._/,-]+', ' ', 'g'), '\s+', ' ', 'g')), '')
  where normalized_name is null and name is not null;
update public.mietwagenunternehmen set normalized_name =
  nullif(btrim(regexp_replace(regexp_replace(lower(name), '[._/,-]+', ' ', 'g'), '\s+', ' ', 'g')), '')
  where normalized_name is null and name is not null;

-- Lookup-Indexe fuer find-or-create
create index if not exists idx_firmen_normalized_name               on public.firmen(normalized_name);
create index if not exists idx_versicherungen_normalized_name       on public.versicherungen(normalized_name);
create index if not exists idx_werkstaetten_normalized_name         on public.werkstaetten(normalized_name);
create index if not exists idx_mietwagenunternehmen_normalized_name on public.mietwagenunternehmen(normalized_name);
create index if not exists idx_vehicles_kennzeichen_normalized      on public.vehicles(kennzeichen_normalized);
create index if not exists idx_firmen_ust_id                        on public.firmen(ust_id);

-- claim_parties.rolle += 'ansprechpartner' (abweichender Firma-Kontakt pro Claim; §3).
-- Alle 9 Bestandswerte erhalten (Stand inkl. 'halter' aus Mig 20260603205846).
alter table public.claim_parties drop constraint if exists claim_parties_rolle_check;
alter table public.claim_parties add constraint claim_parties_rolle_check
  check (rolle = any (array[
    'geschaedigter','verursacher','fahrer_nicht_halter','beifahrer','zeuge',
    'gegner_airdrop','gutachter_gegen','versicherungssachbearbeiter','halter','ansprechpartner'
  ]));
```

- [ ] **Step 2: Getrackte Version ablesen**

`list_migrations` → die für `cmm_entity_resolver_foundation` vergebene Version `<V>` ablesen (eigener Timestamp des Plugins, NICHT raten).

- [ ] **Step 3: Migration-File committen (Anti-Twin-Drift)**

Datei `supabase/migrations/<V>_cmm_entity_resolver_foundation.sql` mit **exakt** dem applizierten SQL anlegen (Dateiname == getrackte Version `<V>`).

- [ ] **Step 4: Verify (READ)**

`execute_sql`:
```sql
select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='firmen' and column_name in ('normalized_name','ansprechpartner_person_id')) as firmen_cols,   -- erwartet 2
  (select count(*) from versicherungen where normalized_name is not null) as vers_backfilled,   -- erwartet ~95
  (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.claim_parties'::regclass and conname='claim_parties_rolle_check') as rolle_check; -- enthaelt 'ansprechpartner'
```
Expected: `firmen_cols=2`, `vers_backfilled≈95`, `rolle_check` enthält `'ansprechpartner'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<V>_cmm_entity_resolver_foundation.sql
git commit -m "feat(cmm-entity): Migration normalized_name + ansprechpartner_person_id + rolle ansprechpartner (Resolver-Foundation T2)"
```

---

## Task 3: `ensureFirma()` (find-or-create)

**Files:**
- Create: `src/lib/firmen/ensure-firma.ts`
- Test: `src/lib/firmen/__tests__/ensure-firma.integration.test.ts`

- [ ] **Step 1: Gated Integration-Test schreiben** (Muster: `src/lib/personen/__tests__/confirm-orphan-match.integration.test.ts`)

```ts
// src/lib/firmen/__tests__/ensure-firma.integration.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { ensureFirma } from '@/lib/firmen/ensure-firma'

const RUN = process.env.RUN_DB_INTEGRATION === '1'
const d = RUN ? describe : describe.skip

d('ensureFirma (DB)', () => {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  it('create-then-find-same = ein Dedup ueber normalized_name', async () => {
    const name = `Testfirma ${Date.now()} GmbH`
    const a = await ensureFirma({ db, snapshot: { name } })
    expect(a.ok).toBe(true)
    // andere Schreibweise, gleiche normalized -> SELBE Zeile
    const b = await ensureFirma({ db, snapshot: { name: name.replace(' GmbH', '  gmbh') } })
    expect(b.ok && a.ok && b.firmaId).toBe(a.ok ? a.firmaId : '')
    expect(b.ok && b.created).toBe(false)
    if (a.ok) await db.from('firmen').delete().eq('id', a.firmaId)
  })
  it('ust_id matcht auch bei abweichendem Namen', async () => {
    const ust = `DE${Date.now()}`
    const a = await ensureFirma({ db, snapshot: { name: 'Alpha', ust_id: ust } })
    const b = await ensureFirma({ db, snapshot: { name: 'Alpha Logistik', ust_id: ust } })
    expect(a.ok && b.ok && b.firmaId).toBe(a.ok ? a.firmaId : '')
    if (a.ok) await db.from('firmen').delete().eq('id', a.firmaId)
  })
})
```

- [ ] **Step 2: Test laufen, Fehlschlag bestätigen**

Run: `RUN_DB_INTEGRATION=1 npx vitest run src/lib/firmen/__tests__/ensure-firma.integration.test.ts`
Expected: FAIL — Modul `@/lib/firmen/ensure-firma` nicht gefunden.

- [ ] **Step 3: Implementierung** (Muster: `ensure-person.ts` — untyped db, non-throwing)

```ts
// src/lib/firmen/ensure-firma.ts
// CMM Entity Resolver-Foundation: find-or-create der globalen firmen-Entitaet.
// Dedup-Key: ust_id (staerkster Beleg) ODER normalized_name. Non-throwing Result-Object;
// db untyped (wie ensure-person.ts/ensure-vehicle.ts), da die DB-Types der frischen Spalte
// hinterherhinken (AGENTS.md Regel 2 Schritt 6).
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from '@/lib/entities/normalize'

export type FirmaSnapshot = {
  name: string
  ust_id?: string | null
  rechtsform?: string | null
  adresse_strasse?: string | null
  adresse_plz?: string | null
  adresse_ort?: string | null
  adresse_land?: string | null
  telefon?: string | null
  email?: string | null
  webseite?: string | null
  ansprechpartner_person_id?: string | null
  quelle?: string | null
}
export type EnsureFirmaResult =
  | { ok: true; firmaId: string; created: boolean }
  | { ok: false; error: string }

export async function ensureFirma(params: {
  db: SupabaseClient
  snapshot: FirmaSnapshot
}): Promise<EnsureFirmaResult> {
  const { db } = params
  const name = params.snapshot.name?.trim() ?? ''
  if (!name) return { ok: false, error: 'firma name leer' }
  const normalized = normalizeName(name)
  if (!normalized) return { ok: false, error: 'firma normalized leer' }
  const ustId = params.snapshot.ust_id?.trim() || null

  const setAnsprechpartnerIfEmpty = async (firmaId: string) => {
    if (params.snapshot.ansprechpartner_person_id) {
      await db.from('firmen')
        .update({ ansprechpartner_person_id: params.snapshot.ansprechpartner_person_id })
        .eq('id', firmaId).is('ansprechpartner_person_id', null)
    }
  }

  try {
    // 1) ust_id — staerkster Key
    if (ustId) {
      const { data, error } = await db.from('firmen').select('id').eq('ust_id', ustId).limit(1).maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (data?.id) { await setAnsprechpartnerIfEmpty(data.id as string); return { ok: true, firmaId: data.id as string, created: false } }
    }
    // 2) normalized_name
    const { data: byName, error: nErr } = await db.from('firmen').select('id').eq('normalized_name', normalized).limit(1).maybeSingle()
    if (nErr) return { ok: false, error: nErr.message }
    if (byName?.id) { await setAnsprechpartnerIfEmpty(byName.id as string); return { ok: true, firmaId: byName.id as string, created: false } }
    // 3) create
    const { data: created, error: insErr } = await db.from('firmen').insert({
      name, normalized_name: normalized, ust_id: ustId,
      rechtsform: params.snapshot.rechtsform ?? null,
      adresse_strasse: params.snapshot.adresse_strasse ?? null,
      adresse_plz: params.snapshot.adresse_plz ?? null,
      adresse_ort: params.snapshot.adresse_ort ?? null,
      adresse_land: params.snapshot.adresse_land ?? null,
      telefon: params.snapshot.telefon ?? null,
      email: params.snapshot.email ?? null,
      webseite: params.snapshot.webseite ?? null,
      ansprechpartner_person_id: params.snapshot.ansprechpartner_person_id ?? null,
      quelle: params.snapshot.quelle ?? 'lead_konvertierung',
    }).select('id').single()
    if (insErr || !created) return { ok: false, error: insErr?.message ?? 'firmen-insert lieferte keine id' }
    return { ok: true, firmaId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
```

- [ ] **Step 4: Test laufen, grün** — `RUN_DB_INTEGRATION=1 npx vitest run src/lib/firmen/__tests__/ensure-firma.integration.test.ts` → PASS (2).
- [ ] **Step 5: tsc** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler.
- [ ] **Step 6: Commit** — `git add src/lib/firmen && git commit -m "feat(cmm-entity): ensureFirma find-or-create (Resolver-Foundation T3)"`

---

## Task 4: `ensureVersicherung()` (find-or-create)

**Files:**
- Create: `src/lib/versicherungen/ensure-versicherung.ts`
- Test: `src/lib/versicherungen/__tests__/ensure-versicherung.integration.test.ts`

- [ ] **Step 1: Gated Integration-Test**

```ts
// src/lib/versicherungen/__tests__/ensure-versicherung.integration.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { ensureVersicherung } from '@/lib/versicherungen/ensure-versicherung'

const RUN = process.env.RUN_DB_INTEGRATION === '1'
;(RUN ? describe : describe.skip)('ensureVersicherung (DB)', () => {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  it('matcht Bestands-Registry semantisch (normalized_name)', async () => {
    // Bestand: eine reale Registry-Versicherung lesen, in abweichender Schreibweise resolven
    const { data } = await db.from('versicherungen').select('name').not('name','is',null).limit(1).single()
    const r = await ensureVersicherung({ db, klartext: (data!.name as string).toUpperCase().replace(/\s+/g, '  ') })
    expect(r.ok).toBe(true)
    expect(r.ok && r.created).toBe(false) // gematcht, nicht neu angelegt
  })
})
```

- [ ] **Step 2: Test laufen, Fehlschlag** — `RUN_DB_INTEGRATION=1 npx vitest run …ensure-versicherung.integration.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

```ts
// src/lib/versicherungen/ensure-versicherung.ts
// CMM Entity Resolver-Foundation: find-or-create Versicherer ueber normalized_name.
// Ersetzt den reinen Fuzzy-Match (resolveFallEntityFks) durch resolve-or-ensure.
// versicherungen.name ist UNIQUE (exakt) -> create nur wenn normalized kein Match fand.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from '@/lib/entities/normalize'

export type EnsureVersicherungResult =
  | { ok: true; versicherungId: string; created: boolean }
  | { ok: false; error: string }

export async function ensureVersicherung(params: {
  db: SupabaseClient
  klartext: string | null | undefined
}): Promise<EnsureVersicherungResult> {
  const { db } = params
  const name = params.klartext?.trim() ?? ''
  if (!name) return { ok: false, error: 'versicherung klartext leer' }
  const normalized = normalizeName(name)
  if (!normalized) return { ok: false, error: 'versicherung normalized leer' }
  try {
    const { data: existing, error: selErr } = await db
      .from('versicherungen').select('id').eq('normalized_name', normalized).limit(1).maybeSingle()
    if (selErr) return { ok: false, error: selErr.message }
    if (existing?.id) return { ok: true, versicherungId: existing.id as string, created: false }

    const { data: created, error: insErr } = await db
      .from('versicherungen').insert({ name, normalized_name: normalized }).select('id').single()
    if (insErr || !created) return { ok: false, error: insErr?.message ?? 'versicherungen-insert lieferte keine id' }
    return { ok: true, versicherungId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
```

- [ ] **Step 4: Test grün** → PASS (1). **Step 5: tsc** → 0. **Step 6: Commit** — `git commit -m "feat(cmm-entity): ensureVersicherung resolve-or-ensure (Resolver-Foundation T4)"`

---

## Task 5: `ensureVehicleFromKennzeichen()` (find-or-create, provisorisch)

**Files:**
- Create: `src/lib/vehicles/ensure-vehicle-from-kennzeichen.ts`
- Test: `src/lib/vehicles/__tests__/ensure-vehicle-from-kennzeichen.integration.test.ts`

- [ ] **Step 1: Gated Integration-Test**

```ts
// src/lib/vehicles/__tests__/ensure-vehicle-from-kennzeichen.integration.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { ensureVehicleFromKennzeichen } from '@/lib/vehicles/ensure-vehicle-from-kennzeichen'

const RUN = process.env.RUN_DB_INTEGRATION === '1'
;(RUN ? describe : describe.skip)('ensureVehicleFromKennzeichen (DB)', () => {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  it('create-then-find-same (provisorisch, FIN-los)', async () => {
    const kz = `B-XX ${Date.now() % 9999}`
    const a = await ensureVehicleFromKennzeichen({ db, kennzeichen: kz })
    const b = await ensureVehicleFromKennzeichen({ db, kennzeichen: kz.toLowerCase().replace('-', ' - ') })
    expect(a.ok && b.ok && b.vehicleId).toBe(a.ok ? a.vehicleId : '')
    expect(b.ok && b.created).toBe(false)
    if (a.ok) await db.from('vehicles').delete().eq('id', a.vehicleId)
  })
})
```

- [ ] **Step 2: Test laufen, Fehlschlag** → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

```ts
// src/lib/vehicles/ensure-vehicle-from-kennzeichen.ts
// CMM Entity Resolver-Foundation: find-or-create Fahrzeug OHNE FIN (Gegner-Auto, oft nur
// Kennzeichen). PROVISORISCH: kennzeichen_normalized ist ein schwacher Key (KZ wird neu
// vergeben) -> mergebar auf die FIN-Zeile, sobald die FIN bekannt wird (spaeterer Merge,
// nicht hier). Ergaenzt ensureVehicleFromFin (FIN = kanonisch). Non-throwing, db untyped.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from '@/lib/entities/normalize'

export type EnsureVehicleFromKennzeichenResult =
  | { ok: true; vehicleId: string; created: boolean }
  | { ok: false; error: string }

export async function ensureVehicleFromKennzeichen(params: {
  db: SupabaseClient
  kennzeichen: string | null | undefined
  klartext?: string | null
}): Promise<EnsureVehicleFromKennzeichenResult> {
  const { db } = params
  const kz = params.kennzeichen?.trim() ?? ''
  if (!kz) return { ok: false, error: 'kennzeichen leer' }
  const normalized = normalizeName(kz)
  if (!normalized) return { ok: false, error: 'kennzeichen normalized leer' }
  try {
    const { data: existing, error: selErr } = await db
      .from('vehicles').select('id').eq('kennzeichen_normalized', normalized).limit(1).maybeSingle()
    if (selErr) return { ok: false, error: selErr.message }
    if (existing?.id) return { ok: true, vehicleId: existing.id as string, created: false }

    const { data: created, error: insErr } = await db.from('vehicles').insert({
      kennzeichen_aktuell: kz,
      kennzeichen_normalized: normalized,
      bauart: params.klartext ?? null,
      fin_quelle: 'kennzeichen_provisorisch',
    }).select('id').single()
    if (insErr || !created) return { ok: false, error: insErr?.message ?? 'vehicles-insert lieferte keine id' }
    return { ok: true, vehicleId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
```

> ⚠️ **Pre-Execution-Check (vom Executor):** `vehicles.fin` ist seit Mig `20260603205846` NULLABLE ✓. Verify aber, dass kein anderer NOT-NULL-Constraint (z.B. ein Pflichtfeld) den FIN-losen Insert bricht — `\d vehicles` / `execute_sql` auf `is_nullable` der nicht-gesetzten Spalten; ggf. Insert-Payload um DB-Defaults ergänzen. (Spalten `kennzeichen_aktuell`/`bauart`/`fin_quelle` existieren — in der Spec/`ensure-vehicle.ts` referenziert.)

- [ ] **Step 4: Test grün** → PASS (1). **Step 5: tsc** → 0. **Step 6: Commit** — `git commit -m "feat(cmm-entity): ensureVehicleFromKennzeichen provisorisch (Resolver-Foundation T5)"`

---

## Task 6: Versicherungen-Registry Dedup-Report (read-only, KEIN Auto-Merge)

**Files:** kein Code — `execute_sql`-Report + Eintrag in den PR-Body.

- [ ] **Step 1: Kollisionen im 95er-Bestand finden**

`execute_sql`:
```sql
select normalized_name, count(*) n, array_agg(name) namen
from versicherungen where normalized_name is not null
group by normalized_name having count(*) > 1 order by n desc;
```

- [ ] **Step 2: Ergebnis dokumentieren** — Kollisionen in den PR-Body schreiben. **Registry NICHT automatisch mergen** (kuratierte Stammdaten; Merge = manuelle Aaron-Entscheidung, separat). Der `unique`-Constraint auf `name` (exakt) + der `normalized_name`-Index reichen für die Resolver; echte Semantik-Dubletten der Registry werden gelistet, nicht stillschweigend zusammengeführt.

---

## Self-Review

**1. Spec-Coverage (gegen Katalog-Spec §2/§5):**
- normalized_name-Spalten (firmen/versicherungen/werkstaetten/mietwagenunternehmen) → Task 2 ✓
- vehicles.kennzeichen_normalized → Task 2 ✓
- firmen.ansprechpartner_person_id (§3) → Task 2 ✓
- claim_parties.rolle += 'ansprechpartner' (§3) → Task 2 ✓
- normalize()-Util → Task 1 ✓
- ensureFirma / ensureVersicherung / ensureVehicleFromKennzeichen → Task 3/4/5 ✓
- dedupe-Backfill (95er-Versicherer) → Task 2 (Backfill) + Task 6 (Kollisions-Report) ✓
- **NICHT in Plan 1 (bewusst):** ensureWerkstatt/ensureMietwagen (Lifecycle, eigener Plan); Writer-Verdrahtung (Plan 3); Schaden/Vorschaden (Plan 2). ✓

**2. Placeholder-Scan:** keine TBD/„handle edge cases" — jeder Code-Step hat vollständigen Code; die DB-Default-/NOT-NULL-Unsicherheit bei vehicles ist als expliziter Pre-Execution-Check markiert (kein Platzhalter, sondern eine Verify-Anweisung). ✓

**3. Typ-Konsistenz:** `normalizeName(string|null|undefined): string|null` einheitlich von allen 3 ensure-Modulen konsumiert. Result-Shapes folgen `ensure-person.ts` (`{ok:true; <id>; created} | {ok:false; error}`). `db: SupabaseClient` (untyped) durchgängig. ✓

**Offene Mini-Punkte für den Executor:** (a) TS-`normalizeName` == SQL-Backfill-Ausdruck bit-identisch halten (Task 1/2). (b) vehicles-FIN-los-Insert gegen Rest-NOT-NULL prüfen (Task 5 Check). (c) Migration-File == getrackte Version (Task 2 Schritt 2-3).
