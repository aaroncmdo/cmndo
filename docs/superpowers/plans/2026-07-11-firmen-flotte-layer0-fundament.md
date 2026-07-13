# Firmen-Flotte Layer 0 — Business-Partner-Fundament — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Business-Partner (firma mit Flotte) wird admin-angelegt, bekommt eine dedizierte `flottenmanager`-Rolle + `/flotte`-Portal und verwaltet dort seine Fahrzeuge — durch **Wiederverwendung** des bestehenden `/kunde/flotte`-Fleet-Kerns (Tabelle `flotten_fahrzeuge`, `FlotteClient`, `createVehicleStub`, `ensureFirma`).

**Architecture:** Der Fleet-Kern existiert bereits kunde-scoped (Migration `20260706100916`). Wir bauen NICHT neu, sondern (a) generalisieren die View + Fleet-Logik in geteilte Module, (b) fügen eine neue Partner-Identität hinzu (Rolle + Link-Tabelle `firmen_flotten_konten` + `/flotte`-Portal + Admin-Anlage). Actions laufen über den Admin-Client mit In-Action-Gate (requirePortalAccess + role-aware firma-Resolver); RLS ist Defense-in-Depth.

**Tech Stack:** Next.js 15 (App Router, Server Actions, `(shell)`-Route-Groups), Supabase (Postgres + RLS, `apply_migration` MCP), TypeScript, vitest, Tailwind + `@/components/primitives` / `@/components/shared`.

## Global Constraints

- **DDL nur via `apply_migration` (MCP)** — Regel 2. `execute_sql` nur READ. Migration-File exakt nach getrackter Version benennen (Twin-Drift-Schutz). MCP ist aktuell disconnected → DDL-Tasks warten bis reconnect (Aaron `/mcp`).
- **Nie direkt auf `main`** — Regel 1. Branch `kitta/firmen-flotte-schadenkarte`, PR gegen `staging`.
- **Server-Actions liefern Result-Objects** `{ ok: boolean; error?: string }` (kein throw); non-kritische Sub-Sends in try/catch. Konstanten/Types NIE aus `'use server'`-Files exportieren.
- **UI-Strings mit echten Umlauten** (ä/ö/ü/ß). Docs/Kommentare/SQL: ASCII erlaubt.
- **Komponenten-Set:** `@/components/primitives/Button`, `@/components/shared/*` (TextField, SectionCard) — kein handgerolltes Button/Card-Markup.
- **7-Punkte-Audit im Commit-Body** (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression).
- **Reuse-Pflicht:** `flotten_fahrzeuge`, `getKundeFlotte`, `createVehicleStub`, `ensureFirma`, `enablePhoneLogin`, `FlotteClient` wiederverwenden — NICHT duplizieren.
- **Scope Layer 0:** KEINE Berührung von `claims`/`claim_parties` (das ist Layer 2). Nur firma/flotte/account/portal.
- **Ratchets 0-neu:** `check:token-audit`, `check:knip`, `check:component-set`, `check:status-registry`.

---

## File Structure

**Neu:**
- `supabase/migrations/<V1>_flottenmanager_rolle.sql` — Enum-Wert (eigene Migration, PG-Restriktion).
- `supabase/migrations/<V2>_firmen_flotten_konten.sql` — Link-Tabelle + Resolver + additive RLS.
- `src/lib/flotte/konto-firma.ts` — role-aware firma-Resolver (`resolveKontoFirma`, `getFlottenmanagerFirma`).
- `src/lib/flotte/mutate-flotte.ts` — geteilte Fleet-Mutation (`addFahrzeugToFlotte`, `removeFahrzeugFromFlotte`).
- `src/components/flotte/FlotteClient.tsx` — VERSCHOBEN aus `src/app/kunde/flotte/FlotteClient.tsx`, Actions als Props.
- `src/lib/partner/anlege-flottenmanager.ts` — `anlegeFlottenmanagerKern` (Konto-Anlage).
- `src/app/admin/firmen-flotte/actions.ts` + `page.tsx` + `FirmenFlotteAdminClient.tsx` — Admin-Anlage-UI.
- `src/components/flotte/FlotteManagerShell.tsx` — Portal-Shell (Copy von `MaklerShell`).
- `src/app/flotte/(shell)/layout.tsx` — Portal-Layout.
- `src/app/flotte/(shell)/flotte/page.tsx` + `actions.ts` — Fleet-View im Partner-Portal.

**Modifiziert (behavior-preserving):**
- `src/lib/auth/guards.ts` — `UserRolle` += `'flottenmanager'`.
- `src/lib/auth/role-redirect.ts` — `Rolle` += `'flottenmanager'`, `roleToPath` case → `/flotte`.
- `src/app/kunde/flotte/page.tsx` — importiert verschobenen `FlotteClient`, reicht kunde-Actions als Props.
- `src/app/kunde/flotte/actions.ts` — nutzt geteilte `mutate-flotte`-Helper (Verhalten identisch).

---

## Task 1: Migration — flottenmanager-Rolle + firmen_flotten_konten + Resolver + RLS

**Files:**
- Create: `supabase/migrations/<V1>_flottenmanager_rolle.sql`
- Create: `supabase/migrations/<V2>_firmen_flotten_konten.sql`

**Interfaces:**
- Produces (DB): Enum-Wert `user_role.'flottenmanager'`; Tabelle `public.firmen_flotten_konten (id, firma_id, user_id, status, aktiviert_am, aktiviert_von, created_at)` mit `unique(user_id)`; Function `public.auth_flottenmanager_firma_id() returns uuid`; additive RLS-Policies auf `flotten_fahrzeuge` + `vehicles`.

- [ ] **Step 1: Enum-Migration schreiben** (`<V1>` = Platzhalter bis `apply_migration` die Version vergibt)

```sql
-- flottenmanager-Rolle fuers Business-Partner-Flotten-Portal.
-- EIGENE Migration: ALTER TYPE ADD VALUE darf nicht in derselben Transaktion wie
-- eine Nutzung des neuen Werts laufen (PG-Restriktion). Deshalb vor V2 appliziert.
alter type public.user_role add value if not exists 'flottenmanager';
```

- [ ] **Step 2: Enum-Migration anwenden**

Run (MCP): `apply_migration({ name: "flottenmanager_rolle", query: "<obiges DDL>" })`
Dann `list_migrations` → die getrackte Version `<V1>` ablesen und das File exakt `supabase/migrations/<V1>_flottenmanager_rolle.sql` benennen (Regel 2, Schritt 3+4).

- [ ] **Step 3: Konten-Migration schreiben**

```sql
-- firmen_flotten_konten: Link flottenmanager-User <-> firma (admin-provisioniert).
-- Analog makler.user_id, aber als eigene Link-Tabelle (firma existiert unabhaengig).
create table if not exists public.firmen_flotten_konten (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmen(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'aktiv' check (status in ('aktiv','pausiert','deaktiviert')),
  aktiviert_am timestamptz not null default now(),
  aktiviert_von uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id)   -- 1 flottenmanager-Konto pro User (1:1 im MVP)
);
create index if not exists idx_ffk_firma on public.firmen_flotten_konten(firma_id);

alter table public.firmen_flotten_konten enable row level security;

-- Definer-Resolver: firma des eingeloggten flottenmanagers (fuer RLS-Policies).
create or replace function public.auth_flottenmanager_firma_id()
returns uuid language sql stable security definer set search_path = public as $$
  select k.firma_id from public.firmen_flotten_konten k
  where k.user_id = auth.uid() and k.status = 'aktiv' limit 1;
$$;
revoke all on function public.auth_flottenmanager_firma_id() from anon;

-- RLS firmen_flotten_konten: eigenes Konto lesen; Staff alles. INSERT/UPDATE nur Admin-Client.
create policy ffk_self_select on public.firmen_flotten_konten
  for select to authenticated using (user_id = (select auth.uid()));
create policy ffk_staff_all on public.firmen_flotten_konten
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')));
revoke all on public.firmen_flotten_konten from anon;
grant select on public.firmen_flotten_konten to authenticated;

-- Additive flotten_fahrzeuge-Policies fuer flottenmanager (OR-verknuepft mit den kunde-Policies).
create policy flotten_fm_select on public.flotten_fahrzeuge
  for select to authenticated using (firma_id = public.auth_flottenmanager_firma_id());
create policy flotten_fm_insert on public.flotten_fahrzeuge
  for insert to authenticated with check (firma_id = public.auth_flottenmanager_firma_id());
create policy flotten_fm_delete on public.flotten_fahrzeuge
  for delete to authenticated using (firma_id = public.auth_flottenmanager_firma_id());

-- Additive vehicles-select fuer die Flotten-Fahrzeuge des flottenmanagers.
create policy vehicles_fm_flotte_select on public.vehicles
  for select to authenticated
  using (exists (select 1 from public.flotten_fahrzeuge ff
    where ff.vehicle_id = vehicles.id and ff.firma_id = public.auth_flottenmanager_firma_id()));
```

- [ ] **Step 4: Konten-Migration anwenden + benennen**

Run (MCP): `apply_migration({ name: "firmen_flotten_konten", query: "<obiges DDL>" })` → `list_migrations` → File als `supabase/migrations/<V2>_firmen_flotten_konten.sql` benennen.

- [ ] **Step 5: Verifizieren (READ)**

Run (MCP): `execute_sql("select 'flottenmanager' = any(enum_range(null::public.user_role)::text[]) as enum_ok; select to_regclass('public.firmen_flotten_konten') is not null as tbl_ok; select proname from pg_proc where proname='auth_flottenmanager_firma_id';")`
Expected: `enum_ok=true`, `tbl_ok=true`, Function-Zeile vorhanden.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<V1>_flottenmanager_rolle.sql supabase/migrations/<V2>_firmen_flotten_konten.sql
git commit -m "feat(flotte): flottenmanager-Rolle + firmen_flotten_konten + RLS-Resolver"
```

---

## Task 2: Role-Plumbing (Typen + Routing)

**Files:**
- Modify: `src/lib/auth/guards.ts:25-33` (UserRolle)
- Modify: `src/lib/auth/role-redirect.ts:8-17` (Rolle) + `:19-58` (roleToPath)
- Test: `src/lib/auth/role-redirect.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `UserRolle` inkl. `'flottenmanager'`; `roleToPath('flottenmanager') === '/flotte'`.

- [ ] **Step 1: Failing test schreiben**

`src/lib/auth/role-redirect.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { roleToPath } from './role-redirect'

describe('roleToPath', () => {
  it('routes flottenmanager to /flotte', () => {
    expect(roleToPath('flottenmanager')).toBe('/flotte')
  })
  it('keeps existing makler routing intact', () => {
    expect(roleToPath('makler')).toBe('/makler')
  })
})
```

- [ ] **Step 2: Test laufen — muss FAILEN**

Run: `npx vitest run src/lib/auth/role-redirect.test.ts`
Expected: FAIL (`roleToPath('flottenmanager')` liefert `/admin` via default).

- [ ] **Step 3: Implementieren**

In `src/lib/auth/role-redirect.ts` den Union-Typ `Rolle` um `| 'flottenmanager'` erweitern (vor `| string`), und in `roleToPath` VOR `case 'admin':` ergänzen:
```typescript
    // Business-Partner-Flotten-Portal (firmen mit Flotte).
    case 'flottenmanager':
      return '/flotte'
```
In `src/lib/auth/guards.ts` den `UserRolle`-Union um `| 'flottenmanager'` erweitern (nach `| 'werkstatt'`).

- [ ] **Step 4: Test laufen — muss PASSEN**

Run: `npx vitest run src/lib/auth/role-redirect.test.ts`
Expected: PASS (beide).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/role-redirect.ts src/lib/auth/guards.ts src/lib/auth/role-redirect.test.ts
git commit -m "feat(flotte): flottenmanager im UserRolle-Typ + roleToPath -> /flotte"
```

---

## Task 3: Geteilte Fleet-Lib (konto-firma + mutate-flotte)

**Files:**
- Create: `src/lib/flotte/konto-firma.ts`
- Create: `src/lib/flotte/mutate-flotte.ts`
- Test: `src/lib/flotte/konto-firma.test.ts`, `src/lib/flotte/mutate-flotte.test.ts`

**Interfaces:**
- Consumes: `getKundeFirma`, `KundeFirma`, `FahrzeugForm` aus `@/lib/kunde/firma-flotte`; `createVehicleStub` aus `@/lib/vehicles/ensure-vehicle`; `firmen_flotten_konten` (Task 1).
- Produces:
  - `resolveKontoFirma(db, userId, rolle): Promise<KundeFirma | null>`
  - `getFlottenmanagerFirma(db, userId): Promise<KundeFirma | null>`
  - `addFahrzeugToFlotte(db, firmaId, form: FahrzeugForm, userId): Promise<{ ok: boolean; error?: string }>`
  - `removeFahrzeugFromFlotte(db, flottenId, firmaId): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Failing test (resolveKontoFirma-Dispatch)**

`src/lib/flotte/konto-firma.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { resolveKontoFirma } from './konto-firma'

function fakeDb(firmaRow: { firma_id: string } | null, firma: Record<string, unknown> | null) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: table === 'firmen_flotten_konten' ? firmaRow : firma }) }),
          maybeSingle: async () => ({ data: table === 'firmen_flotten_konten' ? firmaRow : firma }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('resolveKontoFirma', () => {
  it('resolves via firmen_flotten_konten for flottenmanager', async () => {
    const db = fakeDb({ firma_id: 'f1' }, { id: 'f1', name: 'Flotte GmbH', rechtsform: null, ust_id: null, adresse_strasse: null, adresse_plz: null, adresse_ort: null })
    const res = await resolveKontoFirma(db, 'u1', 'flottenmanager')
    expect(res?.id).toBe('f1')
  })
  it('returns null when flottenmanager has no konto', async () => {
    const db = fakeDb(null, null)
    expect(await resolveKontoFirma(db, 'u1', 'flottenmanager')).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen — FAIL** (`Cannot find module './konto-firma'`)

Run: `npx vitest run src/lib/flotte/konto-firma.test.ts` — Expected: FAIL.

- [ ] **Step 3: `konto-firma.ts` implementieren**

```typescript
// Role-aware firma-Resolver fuer die geteilte Fleet-View. kunde -> personen.firma_id
// (getKundeFirma, Bestand); flottenmanager -> firmen_flotten_konten.firma_id.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getKundeFirma, type KundeFirma } from '@/lib/kunde/firma-flotte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

/** firma des eingeloggten flottenmanagers (via firmen_flotten_konten). db = Admin/Service-Role. */
export async function getFlottenmanagerFirma(db: AnyDb, userId: string): Promise<KundeFirma | null> {
  const { data: konto } = await db
    .from('firmen_flotten_konten')
    .select('firma_id')
    .eq('user_id', userId)
    .eq('status', 'aktiv')
    .maybeSingle()
  const firmaId = (konto?.firma_id as string | null) ?? null
  if (!firmaId) return null
  const { data: f } = await db
    .from('firmen')
    .select('id, name, rechtsform, ust_id, adresse_strasse, adresse_plz, adresse_ort')
    .eq('id', firmaId)
    .maybeSingle()
  if (!f) return null
  return {
    id: f.id as string,
    name: (f.name as string | null) ?? '',
    rechtsform: (f.rechtsform as string | null) ?? null,
    ustId: (f.ust_id as string | null) ?? null,
    strasse: (f.adresse_strasse as string | null) ?? null,
    plz: (f.adresse_plz as string | null) ?? null,
    ort: (f.adresse_ort as string | null) ?? null,
  }
}

/** Dispatch nach Rolle: kunde -> personen.firma_id; flottenmanager -> firmen_flotten_konten. */
export async function resolveKontoFirma(
  db: AnyDb,
  userId: string,
  rolle: string,
): Promise<KundeFirma | null> {
  if (rolle === 'flottenmanager') return getFlottenmanagerFirma(db, userId)
  return getKundeFirma(db, userId)
}
```

- [ ] **Step 4: Test laufen — PASS**

Run: `npx vitest run src/lib/flotte/konto-firma.test.ts` — Expected: PASS.

- [ ] **Step 5: `mutate-flotte.ts` implementieren** (extrahierte Logik aus `kunde/flotte/actions.ts`)

```typescript
// Geteilte Fleet-Mutation (kunde + flottenmanager). Reuse createVehicleStub + N:M-Insert.
// db = Admin/Service-Role (personen/firmen/flotten_fahrzeuge sind deny-all fuer Clients).
import type { SupabaseClient } from '@supabase/supabase-js'
import { createVehicleStub } from '@/lib/vehicles/ensure-vehicle'
import type { FahrzeugForm } from '@/lib/kunde/firma-flotte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

/** Stub-Fahrzeug anlegen + N:M-Zuordnung zur firma. */
export async function addFahrzeugToFlotte(
  db: AnyDb, firmaId: string, form: FahrzeugForm, userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const kennzeichen = (form.kennzeichen ?? '').trim()
  if (!kennzeichen) return { ok: false, error: 'Bitte ein Kennzeichen angeben.' }
  const veh = await createVehicleStub({
    snapshot: { kennzeichen, hersteller: form.hersteller?.trim() || null, modell: form.modell?.trim() || null },
    db,
  })
  if (!veh.ok) return { ok: false, error: veh.error }
  const { error } = await db.from('flotten_fahrzeuge').insert({
    firma_id: firmaId, vehicle_id: veh.vehicleId, added_by_user_id: userId, notiz: form.notiz?.trim() || null,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dieses Fahrzeug ist bereits in der Flotte.' }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/** Flotten-Zuordnung entfernen (nur Eintraege der eigenen firma). */
export async function removeFahrzeugFromFlotte(
  db: AnyDb, flottenId: string, firmaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.from('flotten_fahrzeuge').delete().eq('id', flottenId).eq('firma_id', firmaId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

- [ ] **Step 6: mutate-flotte-Test** (`src/lib/flotte/mutate-flotte.test.ts`) — testet den 23505-Pfad:

```typescript
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/vehicles/ensure-vehicle', () => ({
  createVehicleStub: vi.fn(async () => ({ ok: true, vehicleId: 'v1' })),
}))
import { addFahrzeugToFlotte } from './mutate-flotte'

describe('addFahrzeugToFlotte', () => {
  it('maps unique-violation to a friendly message', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { from: () => ({ insert: async () => ({ error: { code: '23505', message: 'dup' } }) }) } as any
    const res = await addFahrzeugToFlotte(db, 'f1', { kennzeichen: 'K-AB 1' }, 'u1')
    expect(res).toEqual({ ok: false, error: 'Dieses Fahrzeug ist bereits in der Flotte.' })
  })
  it('rejects empty kennzeichen', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await addFahrzeugToFlotte({} as any, 'f1', { kennzeichen: '' }, 'u1')
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 7: Tests laufen — PASS**

Run: `npx vitest run src/lib/flotte/` — Expected: PASS (alle).

- [ ] **Step 8: Commit**

```bash
git add src/lib/flotte/
git commit -m "feat(flotte): geteilte Fleet-Lib (role-aware firma-Resolver + mutate-Helper)"
```

---

## Task 4: FlotteClient nach shared verschieben + parametrisieren; kunde-Flow darauf umstellen

**Files:**
- Create: `src/components/flotte/FlotteClient.tsx` (verschoben + Actions als Props)
- Delete: `src/app/kunde/flotte/FlotteClient.tsx`
- Modify: `src/app/kunde/flotte/page.tsx` (Import + Props)
- Modify: `src/app/kunde/flotte/actions.ts` (nutzt `mutate-flotte`-Helper)

**Interfaces:**
- Consumes: `mutate-flotte` (Task 3), `KundeFirma`/`FlottenFahrzeug`/`FahrzeugForm`/`FirmaForm` aus `@/lib/kunde/firma-flotte`.
- Produces: `FlotteClient`-Props `{ firma, flotte, onSpeichereFirma?, onFuegeHinzu, onEntferne }`. Wenn `onSpeichereFirma` fehlt (flottenmanager, firma ist immer gesetzt), wird das Setup-Formular nie gerendert.

- [ ] **Step 1: `FlotteClient` nach `src/components/flotte/FlotteClient.tsx` verschieben + Actions als Props**

Kopiere den Inhalt von `src/app/kunde/flotte/FlotteClient.tsx` nach `src/components/flotte/FlotteClient.tsx` und ändere NUR den Action-Bezug: entferne `import { speichereFirma, fuegeFahrzeugHinzu, entferneFahrzeug } from './actions'` und erweitere die Props-Signatur:

```typescript
import type { KundeFirma, FlottenFahrzeug, FirmaForm, FahrzeugForm } from '@/lib/kunde/firma-flotte'

type Props = {
  firma: KundeFirma | null
  flotte: FlottenFahrzeug[]
  onSpeichereFirma?: (form: FirmaForm) => Promise<{ ok: boolean; error?: string }>
  onFuegeHinzu: (form: FahrzeugForm) => Promise<{ ok: boolean; error?: string }>
  onEntferne: (flottenId: string) => Promise<{ ok: boolean; error?: string }>
}

export default function FlotteClient({ firma, flotte, onSpeichereFirma, onFuegeHinzu, onEntferne }: Props) {
```
Ersetze die 3 `await speichereFirma(...)` / `await fuegeFahrzeugHinzu(...)` / `await entferneFahrzeug(...)` Aufrufe durch `onSpeichereFirma`/`onFuegeHinzu`/`onEntferne`. Im `if (!firma)`-Zweig: wenn `!onSpeichereFirma`, `return null` (Setup nicht verfügbar). Restliche JSX/Umlaute/`SectionCard`/`Button`/`TextField` unverändert lassen.

- [ ] **Step 2: `src/app/kunde/flotte/FlotteClient.tsx` löschen**

```bash
git rm src/app/kunde/flotte/FlotteClient.tsx
```

- [ ] **Step 3: `kunde/flotte/page.tsx` auf verschobene Komponente + Props umstellen**

Ersetze `import FlotteClient from './FlotteClient'` durch `import FlotteClient from '@/components/flotte/FlotteClient'` und `import { speichereFirma, fuegeFahrzeugHinzu, entferneFahrzeug } from './actions'`. Ändere das Render zu:
```tsx
<FlotteClient
  firma={firma}
  flotte={flotte}
  onSpeichereFirma={speichereFirma}
  onFuegeHinzu={fuegeFahrzeugHinzu}
  onEntferne={entferneFahrzeug}
/>
```
(Server-Actions als Props an eine Client-Komponente zu reichen ist ein gültiges Next-15-Muster.)

- [ ] **Step 4: `kunde/flotte/actions.ts` auf geteilte Helper umstellen (verhaltensgleich)**

In `fuegeFahrzeugHinzu`: ersetze den `createVehicleStub`+`flotten_fahrzeuge`-Insert-Block durch `return addFahrzeugToFlotte(db, firma.id, form, user.id)` (nach dem `getKundeFirma`-Guard + vor dem finalen `revalidatePath` — Helper liefert schon das Result-Object; `revalidatePath('/kunde/flotte')` VOR dem return ziehen). In `entferneFahrzeug`: ersetze den `.delete()`-Block durch `const res = await removeFahrzeugFromFlotte(db, flottenId, firma.id); if (res.ok) revalidatePath('/kunde/flotte'); return res`. Import ergänzen: `import { addFahrzeugToFlotte, removeFahrzeugFromFlotte } from '@/lib/flotte/mutate-flotte'`. `speichereFirma` bleibt unverändert.

- [ ] **Step 5: Build/typecheck — kunde-Flow intakt**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler in `kunde/flotte` oder `components/flotte`.

- [ ] **Step 6: Knip-Check (kein toter FlotteClient-Rest)**

Run: `npm run check:knip`
Expected: kein neues unused-File (der alte Pfad ist gelöscht, der neue hat 2 Consumer nach Task 6).

- [ ] **Step 7: Commit**

```bash
git add src/components/flotte/FlotteClient.tsx src/app/kunde/flotte/page.tsx src/app/kunde/flotte/actions.ts
git commit -m "refactor(flotte): FlotteClient nach shared + Actions als Props; kunde nutzt geteilte mutate-Helper"
```

---

## Task 5: flottenmanager-Konto-Anlage (Kern + Admin-Action + Admin-UI)

**Files:**
- Create: `src/lib/partner/anlege-flottenmanager.ts`
- Create: `src/app/admin/firmen-flotte/actions.ts`
- Create: `src/app/admin/firmen-flotte/page.tsx`, `src/app/admin/firmen-flotte/FirmenFlotteAdminClient.tsx`
- Test: `src/lib/partner/anlege-flottenmanager.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `enablePhoneLogin`, `ensureFirma` (`@/lib/firmen/ensure-firma`, `ensureFirma({db, snapshot}) -> { ok: true; firmaId } | { ok: false; error }`), `requireAdmin` (Admin-Guard, wie in `admin/makler/actions.ts:25`), `sendMaklerWelcome`-Muster (`@/lib/email/google/flows.ts`).
- Produces: `anlegeFlottenmanagerKern(admin, { firmaId, email, telefon, vorname, aktiviertVon }) -> { ok: true; userId; password } | { ok: false; error }`; Admin-Action `createFirmenFlotteKonto(formData) -> { ok, error? }`.

- [ ] **Step 1: Failing test (Kern legt Konto + firmen_flotten_konten an)**

`src/lib/partner/anlege-flottenmanager.test.ts` — mockt den Admin-Client, prüft: bei erfolgreichem `createUser`+`profiles`-Insert wird `firmen_flotten_konten` mit `firma_id`+`user_id` inserted; bei `profiles`-Fehler wird `auth.admin.deleteUser` gerufen (Rollback). (Vollständiger Mock analog `anlegePartnerKern`-Testmustern; die Assertion prüft die `.from('firmen_flotten_konten').insert`-Call-Args + den Rollback-Pfad.)

- [ ] **Step 2: Test laufen — FAIL** (`Cannot find module './anlege-flottenmanager'`)

Run: `npx vitest run src/lib/partner/anlege-flottenmanager.test.ts`

- [ ] **Step 3: `anlege-flottenmanager.ts` implementieren** (Muster: `anlege-partner.ts`, aber ohne Staffel/Promo; firma existiert bereits)

```typescript
// Konto-Anlage flottenmanager (Business-Partner-Flotte). Muster: anlegePartnerKern —
// Auth-User (Random-PW + force_password_change) -> profiles(rolle='flottenmanager') ->
// firmen_flotten_konten-Link -> Rollback-Cascade bei Fehler. KEIN 'use server'.
import { createAdminClient } from '@/lib/supabase/admin'
import { enablePhoneLogin } from '@/lib/auth/phone-login'

type AdminClient = ReturnType<typeof createAdminClient>

function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) password += chars[array[i] % chars.length]
  return password + 'A1!'
}

export type FlottenmanagerAnlageInput = {
  firmaId: string
  email: string // normalisiert (trim + lowercase)
  telefon: string | null
  vorname: string // Ansprechpartner/Anzeigename
  aktiviertVon: string | null // admin user-id
}
export type FlottenmanagerAnlageResult =
  | { ok: true; userId: string; password: string }
  | { ok: false; error: string }

export async function anlegeFlottenmanagerKern(
  admin: AdminClient, input: FlottenmanagerAnlageInput,
): Promise<FlottenmanagerAnlageResult> {
  const password = generatePassword()
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: input.email, password, email_confirm: true,
    user_metadata: { force_password_change: true },
  })
  if (authErr || !authUser?.user) return { ok: false, error: authErr?.message ?? 'User-Anlage fehlgeschlagen' }
  const userId = authUser.user.id

  const { error: profErr } = await admin.from('profiles').insert({
    id: userId, email: input.email, rolle: 'flottenmanager', vorname: input.vorname,
    telefon: input.telefon, force_password_change: true, twofa_aktiviert: false, twofa_email_aktiviert: false,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: profErr.message }
  }

  const { error: konErr } = await admin.from('firmen_flotten_konten').insert({
    firma_id: input.firmaId, user_id: userId, status: 'aktiv', aktiviert_von: input.aktiviertVon,
  })
  if (konErr) {
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: konErr.message }
  }

  await enablePhoneLogin(admin, userId, input.telefon) // best-effort, kollisionssicher
  return { ok: true, userId, password }
}
```

- [ ] **Step 4: Test laufen — PASS**

Run: `npx vitest run src/lib/partner/anlege-flottenmanager.test.ts`

- [ ] **Step 5: Admin-Action `src/app/admin/firmen-flotte/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/admin-guard' // gleicher Helper wie admin/makler/actions.ts
import { ensureFirma } from '@/lib/firmen/ensure-firma'
import { anlegeFlottenmanagerKern } from '@/lib/partner/anlege-flottenmanager'
import { sendFlottenmanagerWelcome } from '@/lib/email/google/flows'

export async function createFirmenFlotteKonto(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin() // wirft/redirectet bei Nicht-Admin; liefert { userId } o.ae.
  const firmaName = String(formData.get('firmaName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const vorname = String(formData.get('vorname') ?? '').trim()
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  if (!firmaName || !email || !vorname) return { ok: false, error: 'Firmenname, Ansprechpartner und E-Mail sind Pflicht.' }

  const db = createAdminClient()
  const firma = await ensureFirma({ db, snapshot: { name: firmaName, quelle: 'firmen_flotte_admin' } })
  if (!firma.ok) return { ok: false, error: firma.error }

  const res = await anlegeFlottenmanagerKern(db, {
    firmaId: firma.firmaId, email, telefon, vorname, aktiviertVon: admin.userId ?? null,
  })
  if (!res.ok) return { ok: false, error: res.error }

  try {
    await sendFlottenmanagerWelcome({ to: email, firma: firmaName, vorname, portalUrl: '/flotte' })
  } catch (err) { console.error('[createFirmenFlotteKonto] Welcome-Mail fehlgeschlagen (non-fatal):', err) }

  revalidatePath('/admin/firmen-flotte')
  return { ok: true }
}
```
(Falls `requireAdmin` eine andere Signatur hat: an `admin/makler/actions.ts:25` exakt spiegeln. `sendFlottenmanagerWelcome` = Copy von `sendMaklerWelcome` in `@/lib/email/google/flows.ts` mit Flotten-Text + Umlauten; falls YAGNI, vorerst `sendMaklerWelcome` NICHT wiederverwenden — Copy anlegen, damit die Kunden-sichtbaren Umlaut-Texte stimmen.)

- [ ] **Step 6: Admin-UI** — `page.tsx` (Server, `requirePortalAccess(['admin'])` + Liste bestehender Konten) + `FirmenFlotteAdminClient.tsx` (Formular Firmenname/Ansprechpartner/E-Mail/Telefon → `createFirmenFlotteKonto`). **Copy-Template:** `src/app/admin/makler/page.tsx` + `src/app/admin/makler/MaklerAdminClient.tsx` — Felder auf {Firmenname, Ansprechpartner-Vorname, E-Mail, Telefon} reduzieren, Action auf `createFirmenFlotteKonto` umbiegen, Titel „Firmen-Flotten-Konten". Nur `@/components/shared/forms/*` + `@/components/primitives/Button`.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: grün (Server-Action-Validator + Route-Typen ok).

- [ ] **Step 8: Commit**

```bash
git add src/lib/partner/anlege-flottenmanager.ts src/lib/partner/anlege-flottenmanager.test.ts src/app/admin/firmen-flotte/ src/lib/email/google/flows.ts
git commit -m "feat(flotte): flottenmanager-Konto-Anlage (Kern + Admin-Action + Admin-UI)"
```

---

## Task 6: /flotte-Portal (Shell + Layout + Fleet-View + Actions)

**Files:**
- Create: `src/components/flotte/FlotteManagerShell.tsx`
- Create: `src/app/flotte/(shell)/layout.tsx`
- Create: `src/app/flotte/(shell)/flotte/page.tsx`, `src/app/flotte/(shell)/flotte/actions.ts`

**Interfaces:**
- Consumes: `requirePortalAccess` (`['flottenmanager']`), `resolveKontoFirma` (Task 3), `getKundeFlotte` (`@/lib/kunde/firma-flotte`), `addFahrzeugToFlotte`/`removeFahrzeugFromFlotte` (Task 3), `FlotteClient` (Task 4), `firmen_flotten_konten` (Task 1).
- Produces: Route `/flotte` (Redirect-Ziel aus Task 2) → `/flotte/flotte`-Fleet-View.

- [ ] **Step 1: Portal-Shell** `src/components/flotte/FlotteManagerShell.tsx` — **Copy-Template:** `src/components/makler/MaklerShell.tsx`. Nav-Items auf {„Flotte" → `/flotte/flotte`} reduzieren (Karten/Schäden kommen in Layer 1/2), Titel/Branding „Flotten-Verwaltung", Props `{ firma: { name }, email, userId }`. Umlaute in allen sichtbaren Labels.

- [ ] **Step 2: Layout** `src/app/flotte/(shell)/layout.tsx` (Copy-Muster: `src/app/makler/(shell)/layout.tsx`)

```tsx
import { redirect } from 'next/navigation'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { FlotteManagerShell } from '@/components/flotte/FlotteManagerShell'

export const dynamic = 'force-dynamic'

export default async function FlotteLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const { data: konto } = await db
    .from('firmen_flotten_konten')
    .select('status, firma:firma_id(name)')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!konto) redirect('/login?error=Kein+Flotten-Konto')
  if (konto.status !== 'aktiv') redirect('/login?error=Konto+nicht+aktiv')
  const firmaRaw = konto.firma as unknown
  const firma = (Array.isArray(firmaRaw) ? firmaRaw[0] : firmaRaw) as { name: string } | null

  return (
    <FlotteManagerShell firma={{ name: firma?.name ?? 'Flotte' }} email={user.email ?? ''} userId={user.id}>
      {children}
    </FlotteManagerShell>
  )
}
```

- [ ] **Step 3: Fleet-Actions** `src/app/flotte/(shell)/flotte/actions.ts`

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { addFahrzeugToFlotte, removeFahrzeugFromFlotte } from '@/lib/flotte/mutate-flotte'
import type { FahrzeugForm } from '@/lib/kunde/firma-flotte'

export async function fuegeFahrzeugHinzu(form: FahrzeugForm): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const res = await addFahrzeugToFlotte(db, firma.id, form, user.id)
  if (res.ok) revalidatePath('/flotte/flotte')
  return res
}

export async function entferneFahrzeug(flottenId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const res = await removeFahrzeugFromFlotte(db, flottenId, firma.id)
  if (res.ok) revalidatePath('/flotte/flotte')
  return res
}
```

- [ ] **Step 4: Fleet-Page** `src/app/flotte/(shell)/flotte/page.tsx`

```tsx
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma, } from '@/lib/flotte/konto-firma'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import FlotteClient from '@/components/flotte/FlotteClient'
import { fuegeFahrzeugHinzu, entferneFahrzeug } from './actions'

export const dynamic = 'force-dynamic'

export default async function FlottePage() {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  const flotte = firma ? await getKundeFlotte(db, firma.id) : []

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
      <h1 className="text-xl font-bold text-claimondo-navy">Flotte</h1>
      <p className="mt-1 mb-6 text-sm text-claimondo-shield">
        Ihre Firmenfahrzeuge — Grundlage für die Schadenkarten.
      </p>
      {/* onSpeichereFirma bewusst weggelassen: firma ist admin-provisioniert, kein Setup-Formular. */}
      <FlotteClient firma={firma} flotte={flotte} onFuegeHinzu={fuegeFahrzeugHinzu} onEntferne={entferneFahrzeug} />
    </div>
  )
}
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: grün. Route `/flotte/flotte` existiert; `/flotte` redirected via Nav/Shell-Default (oder ergänze eine `src/app/flotte/(shell)/page.tsx`, die auf `/flotte/flotte` weiterleitet — als Content-Page mit `redirect()` NUR wenn kein Redirect-Stub-Verstoß; sonst `next.config.ts`-Redirect `/flotte` → `/flotte/flotte`). **Wähle den `next.config.ts`-Redirect** (Redirect-Stub-Gate, AGENTS).

- [ ] **Step 6: `next.config.ts` — `/flotte` → `/flotte/flotte`**

In `redirects()` ergänzen: `{ source: '/flotte', destination: '/flotte/flotte', permanent: false }`.

- [ ] **Step 7: Prod-Smoke (nach Deploy) / lokaler Render-Check**

Ein flottenmanager-Testkonto (admin-angelegt) → Login → `/flotte` → sieht die Fleet-View, fügt ein Kennzeichen hinzu, entfernt es. Erwartungen: nur die eigene firma-Flotte sichtbar (RLS/Resolver), add/remove funktioniert.

- [ ] **Step 8: Ratchets + Commit**

Run: `npm run check:token-audit && npm run check:component-set && npm run check:knip && npm run check:status-registry`
Expected: 0-neu.
```bash
git add src/components/flotte/FlotteManagerShell.tsx src/app/flotte/ next.config.ts
git commit -m "feat(flotte): /flotte-Partner-Portal (Shell + Layout + Fleet-View, reused FlotteClient)"
```

---

## Self-Review

**Spec-Coverage:** Spec §4.1 (flotten_fahrzeuge) — existiert, wird wiederverwendet (Task 3/4). Spec „firma-Partner-Registrierung admin-angelegt" — Task 5. Spec „Flottenverwaltung-View" — Task 4/6. Spec „flottenmanager-Rolle/Portal" — Task 1/2/6. Layer-1/2 (Karte, Schaden) bewusst NICHT hier (eigene Pläne).
**Placeholder-Scan:** `<V1>`/`<V2>` sind bewusste Migration-Versions-Platzhalter (von `apply_migration` vergeben, Regel 2 Schritt 3). Copy-Templates (MaklerShell/MaklerAdminClient) mit exakten Pfaden + Deltas — kein Hand-Waving.
**Typ-Konsistenz:** `resolveKontoFirma`/`getFlottenmanagerFirma` liefern `KundeFirma`; `add/removeFahrzeugToFlotte` liefern `{ ok, error? }`; `FlotteClient`-Props konsistent zwischen Task 4 (Def) und Task 6 (Consumer). `anlegeFlottenmanagerKern` Result `{ ok, userId, password }`.
**Offene Annahmen (im Task markiert):** `requireAdmin`-Signatur (an `admin/makler/actions.ts` spiegeln); `sendFlottenmanagerWelcome` als Copy von `sendMaklerWelcome`; `MaklerShell`/`MaklerAdminClient` als Copy-Basis — der Implementierer liest die referenzierten Dateien.

## Nächste Pläne (nicht dieser)
- **Plan 2 — Layer 1: Schadenkarte** (`schadenkarte`-Tabelle am vehicle, Bestellen/Binden im Fleet-View, NDEF-Token).
- **Plan 3/4 — Layer 2: Gegner-Flow + Claim + VS-Meldung** (DPIA-gegated, siehe `2026-07-11-dpia-nfc-schadenkarte-gegner-flow.md`).
