# Netzwerk-Ökosystem P0 (Fundament) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die additive Daten-Foundation des Netzwerk-Ökosystem-Epics bauen — Freund-Graph, Entitlement-Subscription, Kunden-Bindung, Prädikat + Batch-Loader — ohne die aktiven Fundament-C-Pakete zu berühren.

**Architecture:** Rein **additive** DDL (neue Tabellen/Spalten/View, keine bestehende Zeile/Policy verändert) + zwei pure TS-Module (Entitlement-Prädikat, Freund-Auflösung), beide **batched** (ein DB-Read pro Ranking-Call, nie per-Kandidat). Der Graph ist `profiles↔profiles`; die Boost-/Provisions-/Flow-Consumer kommen erst in P2–P6 und docken auf C1–C5.

**Tech Stack:** Supabase Postgres (DDL via MCP-Plugin `apply_migration`), TypeScript + `@supabase/supabase-js` (Admin-Client), vitest.

## Global Constraints

- **DDL NUR via Supabase-Plugin `apply_migration`** (AGENTS.md Regel 2). Ablauf je Migration: apply → `list_migrations` (getrackte Version `<V>` ablesen) → File committen als `supabase/migrations/<V>_<name>.sql` → `execute_sql` (READ) verifizieren → Typen regenerieren + committen (`src/lib/supabase/database.types.ts`).
- **Neue public-Tabelle grantet anon NICHTS** (Default-Privileges-Wurzel). Explizite Grants; PERMISSIVE `CREATE POLICY` immer mit `TO authenticated` (nie `TO public`).
- **Nie auf `main` pushen.** Branch `kitta/aar-<nr>-fundament-netzwerk-p0`, PR gegen `staging`, nicht selbst mergen.
- **Ratchets grün** (0-neu): `check:flag-drift`, `check:token-audit`, `check:component-set`, `check:knip`, `check:rls-policies`, `check:rls-grants`. Neue Enums MÜSSEN in den CHECK **und** den flag-drift-Snapshot **vor** jedem Code-Write, der sie schreibt.
- **prod-Ref = `paizkjajbuxxksdoycev`** (teilt DB mit staging). Verifikation via `execute_sql` READ-only.
- **Entitlement service-role-only schreibbar** (K1): kein authenticated-INSERT/UPDATE auf `sv_netzwerk_abonnements`; kein roher Bool auf `sachverstaendige`.
- **`v_netzwerk_freunde` NICHT an authenticated granten** (Definer-View umgeht RLS → Graph-Leak); nur `service_role`.
- **`paket` NIE überschreiben** (K3): Entitlement ist eine separate Achse.
- Pflichtlektüre vor Start: `docs/superpowers/specs/2026-07-27-{netzwerk-oekosystem-epic-overview, hardening-und-koordination-vor-plaenen, implementierungs-roadmap-phasen}.md` + `docs/fundament/FUNDAMENT.md` §1+§2 + Marker `[[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]]`.

## Koordinations-Gates (blockieren den MERGE, nicht das Schreiben von Tests/Code)

- **#4789 / `a6c863e2`** (claims-RLS): Task 3 fügt eine Spalte an `claims` → **DDL-Reihenfolge absprechen**, nach deren Migration rebasen. Spalte ist additive Attribution (kein Zeilen-RLS-Change; `claim_sichtbar_fuer_aktuellen_user` wird NICHT verändert — der Owner sieht den Claim nicht automatisch, Default-Produktentscheid).
- Graph/Abo/Prädikat (Tasks 1/2/4/5) haben **keine** Lane-Kollision (net-new Files/Tabellen) → sofort baubar.

---

## Task 0: Worktree + Ist-Erhebung (kein Merge-Deliverable)

**Files:** keine (Verifikation).

- [ ] **Schritt 1:** Frischen Worktree off staging: `node scripts/new-session-worktree.mjs aar-<nr>-fundament-netzwerk-p0 staging`; Branch auf `origin/staging` verifizieren (`git log -1 origin/staging` == HEAD).
- [ ] **Schritt 2:** Greenfield bestätigen (via Plugin `execute_sql`, prod-Ref):
```sql
select table_name from information_schema.tables where table_schema='public'
  and table_name in ('netzwerk_verbindungen','sv_netzwerk_abonnements');
select column_name from information_schema.columns where table_schema='public'
  and table_name='claims' and column_name='netzwerk_owner_id';
```
Erwartet: 0 Zeilen (nichts existiert). Falls doch existent → STOP, mit Marker abgleichen (andere Lane war schneller).
- [ ] **Schritt 3:** Identitäts-Spalten gegen prod verifizieren (Namen können driften):
```sql
select table_name, column_name from information_schema.columns where table_schema='public'
 and ((table_name='sachverstaendige' and column_name in ('id','profile_id'))
   or (table_name='werkstaetten' and column_name='user_id')
   or (table_name='firmen_flotten_konten' and column_name='user_id'));
```
Erwartet: `sachverstaendige.profile_id`, `werkstaetten.user_id`, `firmen_flotten_konten.user_id` vorhanden. Abweichung → Task-1/5-DDL anpassen.

---

## Task 1: Graph-Tabelle `netzwerk_verbindungen` + View `v_netzwerk_freunde`

**Files:**
- Create (DDL via Plugin): `supabase/migrations/<V>_netzwerk_verbindungen.sql`
- Modify: `src/lib/supabase/database.types.ts` (regen)

**Interfaces:**
- Produces: Tabelle `netzwerk_verbindungen(id, anfrager_id, empfaenger_id, status, erstellt_am, beantwortet_am)`; View `v_netzwerk_freunde(profil_id, freund_id)` (nur `status='angenommen'`, beide Richtungen). Konsumiert von Task 5.

- [ ] **Schritt 1: Verifikations-Query schreiben (erwartet FAIL = Tabelle fehlt)**
```sql
select count(*) from public.netzwerk_verbindungen;
```
Erwartet: Fehler `relation "public.netzwerk_verbindungen" does not exist`.

- [ ] **Schritt 2: Migration anwenden** (`apply_migration`, name `netzwerk_verbindungen`):
```sql
create table public.netzwerk_verbindungen (
  id             uuid primary key default gen_random_uuid(),
  anfrager_id    uuid not null references public.profiles(id) on delete cascade,
  empfaenger_id  uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'offen'
                   check (status in ('offen','angenommen','abgelehnt','blockiert')),
  erstellt_am    timestamptz not null default now(),
  beantwortet_am timestamptz,
  constraint netzwerk_verbindungen_kein_selbst check (anfrager_id <> empfaenger_id)
);
create unique index netzwerk_verbindungen_paar_uniq
  on public.netzwerk_verbindungen (least(anfrager_id, empfaenger_id), greatest(anfrager_id, empfaenger_id));
create index netzwerk_verbindungen_anfrager_idx  on public.netzwerk_verbindungen (anfrager_id, status);
create index netzwerk_verbindungen_empfaenger_idx on public.netzwerk_verbindungen (empfaenger_id, status);

alter table public.netzwerk_verbindungen enable row level security;
create policy netzwerk_verbindungen_select on public.netzwerk_verbindungen
  for select to authenticated using (anfrager_id = auth.uid() or empfaenger_id = auth.uid());
create policy netzwerk_verbindungen_insert on public.netzwerk_verbindungen
  for insert to authenticated with check (anfrager_id = auth.uid() and anfrager_id <> empfaenger_id);
create policy netzwerk_verbindungen_update on public.netzwerk_verbindungen
  for update to authenticated using (anfrager_id = auth.uid() or empfaenger_id = auth.uid());
grant select, insert, update on public.netzwerk_verbindungen to authenticated;

create view public.v_netzwerk_freunde as
  select anfrager_id  as profil_id, empfaenger_id as freund_id
    from public.netzwerk_verbindungen where status = 'angenommen'
  union all
  select empfaenger_id as profil_id, anfrager_id  as freund_id
    from public.netzwerk_verbindungen where status = 'angenommen';
revoke all on public.v_netzwerk_freunde from anon, authenticated;
grant select on public.v_netzwerk_freunde to service_role;
```

- [ ] **Schritt 3: Getrackte Version ablesen + File committen** — `list_migrations` → `<V>`; File `supabase/migrations/<V>_netzwerk_verbindungen.sql` mit exakt obigem DDL committen (Dateiname == `<V>`, Twin-Drift vermeiden).

- [ ] **Schritt 4: Verifizieren** (`execute_sql` READ):
```sql
select conname from pg_constraint where conrelid='public.netzwerk_verbindungen'::regclass;   -- kein_selbst + paar via idx
select count(*) from public.v_netzwerk_freunde;   -- 0, aber Relation existiert
select grantee, privilege_type from information_schema.role_table_grants
  where table_name='v_netzwerk_freunde';   -- nur service_role
```
Erwartet: Constraints da; View leer aber existent; **kein** authenticated/anon-Grant auf die View.

- [ ] **Schritt 5: Typen regen + Ratchets + Commit**
```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
npm run check:rls-policies -- --ratchet && npm run check:rls-grants
git add supabase/migrations src/lib/supabase/database.types.ts
git commit -m "feat(netzwerk): netzwerk_verbindungen graph + v_netzwerk_freunde (P0 T1)"
```

---

## Task 2: Entitlement-Tabelle `sv_netzwerk_abonnements` (derive-at-read, service-role-write)

**Files:**
- Create: `supabase/migrations/<V>_sv_netzwerk_abonnements.sql`
- Modify: `src/lib/supabase/database.types.ts` (regen)

**Interfaces:**
- Produces: `sv_netzwerk_abonnements(id, sv_id, status, gueltig_bis, stripe_subscription_id, erstellt_am, aktualisiert_am)`. Konsumiert von Task 4.

- [ ] **Schritt 1: Verifikations-Query (erwartet FAIL)**
```sql
select count(*) from public.sv_netzwerk_abonnements;
```
Erwartet: `does not exist`.

- [ ] **Schritt 2: Migration anwenden** (`apply_migration`, name `sv_netzwerk_abonnements`):
```sql
create table public.sv_netzwerk_abonnements (
  id                    uuid primary key default gen_random_uuid(),
  sv_id                 uuid not null references public.sachverstaendige(id) on delete cascade,
  status                text not null default 'inaktiv'
                          check (status in ('inaktiv','aktiv','ueberfaellig','gekuendigt','comped')),
  gueltig_bis           timestamptz,
  stripe_subscription_id text,
  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now()
);
create unique index sv_netzwerk_abo_sv_uniq on public.sv_netzwerk_abonnements (sv_id);
create index sv_netzwerk_abo_status_idx on public.sv_netzwerk_abonnements (status, gueltig_bis);

alter table public.sv_netzwerk_abonnements enable row level security;
-- SV liest die eigene Abo-Zeile; NIEMAND schreibt via authenticated (nur service_role, K1).
create policy sv_netzwerk_abo_select_own on public.sv_netzwerk_abonnements
  for select to authenticated
  using (sv_id in (select s.id from public.sachverstaendige s where s.profile_id = auth.uid()));
grant select on public.sv_netzwerk_abonnements to authenticated;
-- KEIN insert/update/delete-Grant an authenticated → Writes ausschliesslich service_role (Stripe-Webhook, Admin).
```

- [ ] **Schritt 3: Version ablesen + File committen** (analog T1, Dateiname == getrackte Version).

- [ ] **Schritt 4: Verifizieren**
```sql
select privilege_type from information_schema.role_table_grants
  where table_name='sv_netzwerk_abonnements' and grantee='authenticated';   -- NUR SELECT
```
Erwartet: nur `SELECT` für authenticated (kein INSERT/UPDATE/DELETE).

- [ ] **Schritt 5: Typen regen + Ratchets + Commit** (analog T1; Commit-Msg `feat(netzwerk): sv_netzwerk_abonnements entitlement (P0 T2)`).

---

## Task 3: Bindungs-Spalten `claims.netzwerk_owner_id` + `profiles.netzwerk_owner_id`

**⚠ MERGE-GATE:** DDL-Reihenfolge mit `a6c863e2`/#4789 absprechen (claims-Tabelle). Additive Spalte, **keine** RLS-Änderung.

**Files:**
- Create: `supabase/migrations/<V>_netzwerk_owner_bindung.sql`
- Modify: `src/lib/supabase/database.types.ts` (regen)

**Interfaces:**
- Produces: `claims.netzwerk_owner_id` (per-Claim), `profiles.netzwerk_owner_id` + `netzwerk_owner_seit` (Kunden-Default). Konsumiert von P3-Seeding + P2-Boost.

- [ ] **Schritt 1: Verifikations-Query (erwartet FAIL/leer)**
```sql
select column_name from information_schema.columns
  where table_schema='public' and table_name='claims' and column_name='netzwerk_owner_id';
```
Erwartet: 0 Zeilen.

- [ ] **Schritt 2: Migration anwenden** (`apply_migration`, name `netzwerk_owner_bindung`):
```sql
alter table public.claims
  add column netzwerk_owner_id uuid references public.profiles(id);
alter table public.profiles
  add column netzwerk_owner_id   uuid references public.profiles(id),
  add column netzwerk_owner_seit timestamptz;
comment on column public.claims.netzwerk_owner_id is
  'Per-Claim Netzwerk-Owner (Attribution fuer Finder-Boost); gesetzt bei Anlage aus Vermittler/SV-Origin. KEIN Visibility-Grant.';
```
(Keine neuen Grants nötig — `claims`/`profiles` haben bestehende authenticated-Grants; die Spalte erbt sie. **Nicht** an anon exponieren: prüfen, dass `claims`/`profiles` keinen anon-SELECT-Grant tragen — falls doch, ist das ein Alt-Zustand, NICHT hier ausweiten.)

- [ ] **Schritt 3: Version ablesen + File committen** (Dateiname == getrackte Version).

- [ ] **Schritt 4: Verifizieren**
```sql
select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='claims' and column_name='netzwerk_owner_id';
```
Erwartet: 1 Zeile, `uuid`.

- [ ] **Schritt 5: Typen regen + Commit** (Commit-Msg `feat(netzwerk): per-claim + kunde-default netzwerk_owner_id (P0 T3)`).

---

## Task 4: Entitlement-Prädikat `istZahlenderNetzwerkPartner` + Batch-Loader

**Files:**
- Create: `src/lib/netzwerk/entitlement.ts`
- Test: `src/lib/netzwerk/__tests__/entitlement.test.ts`

**Interfaces:**
- Consumes: `sv_netzwerk_abonnements` (Task 2).
- Produces: `ladeZahlendeSvSet(admin, svIds: string[]): Promise<Set<string>>` (ein Read; die Teilmenge der `svIds`, die aktiv/comped + nicht abgelaufen sind); `istZahlenderNetzwerkPartner(admin, svId: string): Promise<boolean>` (dünner Wrapper). Konsumiert von P2 (Boost).

- [ ] **Schritt 1: Failing Test schreiben**
```ts
import { describe, it, expect, vi } from 'vitest'
import { istAktivesAbo } from '../entitlement'

describe('istAktivesAbo (pure)', () => {
  const now = new Date('2026-07-28T00:00:00Z')
  it('aktiv + gueltig_bis in Zukunft = true', () => {
    expect(istAktivesAbo({ status: 'aktiv', gueltig_bis: '2026-08-28T00:00:00Z' }, now)).toBe(true)
  })
  it('comped (Bestand) = true, auch ohne gueltig_bis', () => {
    expect(istAktivesAbo({ status: 'comped', gueltig_bis: null }, now)).toBe(true)
  })
  it('aktiv aber abgelaufen = false', () => {
    expect(istAktivesAbo({ status: 'aktiv', gueltig_bis: '2026-07-01T00:00:00Z' }, now)).toBe(false)
  })
  it('ueberfaellig/gekuendigt/inaktiv = false', () => {
    for (const s of ['ueberfaellig','gekuendigt','inaktiv'] as const)
      expect(istAktivesAbo({ status: s, gueltig_bis: '2999-01-01T00:00:00Z' }, now)).toBe(false)
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/entitlement.test.ts` → FAIL („istAktivesAbo is not a function").

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/netzwerk/entitlement.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type AboZeile = { status: string; gueltig_bis: string | null }

/** Reine Ableitung (derive-at-read, K1): comped ODER (aktiv UND nicht abgelaufen). */
export function istAktivesAbo(abo: AboZeile, now: Date = new Date()): boolean {
  if (abo.status === 'comped') return true
  if (abo.status !== 'aktiv') return false
  return abo.gueltig_bis == null ? false : new Date(abo.gueltig_bis) >= now
}

/** Batch (K10): EIN Read; liefert die Teilmenge der svIds mit aktivem/comped Abo. */
export async function ladeZahlendeSvSet(
  admin: SupabaseClient, svIds: string[], now: Date = new Date(),
): Promise<Set<string>> {
  if (svIds.length === 0) return new Set()
  const { data, error } = await admin
    .from('sv_netzwerk_abonnements')
    .select('sv_id, status, gueltig_bis')
    .in('sv_id', svIds)
  if (error) { console.error('[ladeZahlendeSvSet]', error.message); return new Set() }
  const out = new Set<string>()
  for (const r of (data ?? []) as Array<{ sv_id: string } & AboZeile>)
    if (istAktivesAbo(r, now)) out.add(r.sv_id)
  return out
}

export async function istZahlenderNetzwerkPartner(admin: SupabaseClient, svId: string): Promise<boolean> {
  return (await ladeZahlendeSvSet(admin, [svId])).has(svId)
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/entitlement.test.ts` → PASS.

- [ ] **Schritt 5: Commit** — `git add src/lib/netzwerk && git commit -m "feat(netzwerk): entitlement derive-at-read + batch-loader (P0 T4)"`.

---

## Task 5: Freund-Auflösung im Kandidaten-id-Raum (Batch)

**Files:**
- Create: `src/lib/netzwerk/freunde.ts`
- Test: `src/lib/netzwerk/__tests__/freunde.test.ts`

**Interfaces:**
- Consumes: `v_netzwerk_freunde` (Task 1), Entity-Links (`werkstaetten.user_id`, `sachverstaendige.profile_id`).
- Produces: `ladeFreundKandidatIds(admin, ownerProfilId, zielRolle): Promise<Set<string>>` — die Entity-Ids (werkstaetten.id bzw. sachverstaendige.id) der befreundeten Partner des Owners der Zielrolle. Konsumiert von P2.

- [ ] **Schritt 1: Failing Test schreiben**
```ts
import { describe, it, expect } from 'vitest'
import { ZIELROLLE_TO_ENTITY } from '../freunde'

describe('ZIELROLLE_TO_ENTITY mapping', () => {
  it('werkstatt → werkstaetten.user_id', () => {
    expect(ZIELROLLE_TO_ENTITY.werkstatt).toEqual({ tabelle: 'werkstaetten', profilSpalte: 'user_id' })
  })
  it('gutachter → sachverstaendige.profile_id', () => {
    expect(ZIELROLLE_TO_ENTITY.gutachter).toEqual({ tabelle: 'sachverstaendige', profilSpalte: 'profile_id' })
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/freunde.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**
```ts
// src/lib/netzwerk/freunde.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type Zielrolle = 'werkstatt' | 'gutachter'
export const ZIELROLLE_TO_ENTITY: Record<Zielrolle, { tabelle: string; profilSpalte: string }> = {
  werkstatt: { tabelle: 'werkstaetten', profilSpalte: 'user_id' },
  gutachter: { tabelle: 'sachverstaendige', profilSpalte: 'profile_id' },
}

/**
 * Batch (K10): die Entity-Ids der befreundeten Partner des Owners im Kandidaten-id-Raum.
 * Zwei Reads (Freund-Profile via Definer-View, dann Entity-Auflösung) — nie per-Kandidat.
 * admin = service-role (v_netzwerk_freunde ist service_role-only).
 */
export async function ladeFreundKandidatIds(
  admin: SupabaseClient, ownerProfilId: string, zielRolle: Zielrolle,
): Promise<Set<string>> {
  const { data: freunde, error: e1 } = await admin
    .from('v_netzwerk_freunde').select('freund_id').eq('profil_id', ownerProfilId)
  if (e1) { console.error('[ladeFreundKandidatIds] freunde', e1.message); return new Set() }
  const freundProfile = (freunde ?? []).map((r: { freund_id: string }) => r.freund_id)
  if (freundProfile.length === 0) return new Set()
  const { tabelle, profilSpalte } = ZIELROLLE_TO_ENTITY[zielRolle]
  const { data: entities, error: e2 } = await admin
    .from(tabelle).select('id').in(profilSpalte, freundProfile)
  if (e2) { console.error('[ladeFreundKandidatIds] entities', e2.message); return new Set() }
  return new Set((entities ?? []).map((r: { id: string }) => r.id))
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/freunde.test.ts` → PASS.

- [ ] **Schritt 5: Commit** — `git add src/lib/netzwerk && git commit -m "feat(netzwerk): freund-aufloesung im kandidaten-id-raum, batch (P0 T5)"`.

---

## Task 6: flag-drift-Snapshot + Ratchet-Grün-Abschluss

**Files:**
- Modify: `scripts/lib/status-check-constraints.json` (via Snapshot-Regen)
- Test: `npm run check:flag-drift -- --ratchet`

- [ ] **Schritt 1:** Snapshot regenerieren (nach den 3 Migrationen, damit die neuen CHECKs `netzwerk_verbindungen.status` + `sv_netzwerk_abonnements.status` drin sind):
```bash
node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs
```
- [ ] **Schritt 2:** flag-drift grün:
```bash
npm run check:flag-drift -- --ratchet
```
Erwartet: exit 0 (neue enum-Spalten im Snapshot bekannt).
- [ ] **Schritt 3:** Voller Gate-Durchlauf:
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run build
npm run check:knip -- --ratchet && npm run check:component-set -- --ratchet && npm run check:token-audit && npm run check:rls-policies -- --ratchet
```
Erwartet: alle grün / 0-neu.
- [ ] **Schritt 4: Commit** — `git add scripts/lib/status-check-constraints.json && git commit -m "chore(netzwerk): flag-drift snapshot += netzwerk enums (P0 T6)"`.

---

## Definition of Done (P0)

- Migrationen appliziert + Files getrackt (Dateiname == getrackte Version, kein Twin-Drift); `database.types.ts` regeneriert + committed.
- `execute_sql`-Nachweis: Tabellen/View/Spalten existieren; `v_netzwerk_freunde` **nicht** an authenticated; `sv_netzwerk_abonnements` authenticated-**SELECT-only**.
- vitest grün (entitlement + freunde); tsc + build grün; alle Ratchets 0-neu.
- **Kein** Consumer angefasst (matching-score/finder/provision bleiben unverändert — das ist P2+).
- PR gegen `staging`, DDL-Reihenfolge mit #4789 abgestimmt, nicht selbst gemergt.
- **Kein Prod-Smoke nötig** (P0 ist inert: keine nutzersichtbare Route/kein Verhalten — reine Foundation; Regel 4 greift ab P1/P2, wenn ein Consumer live geht).

---

## Self-Review (durchgeführt beim Schreiben)

1. **Spec-Coverage:** Roadmap-P0 = Graph (T1) ✓ · sv_netzwerk_abonnements derive-at-read (T2) ✓ · claims/profiles.netzwerk_owner_id (T3) ✓ · Prädikat+Batch (T4) ✓ · Freund-Auflösung Batch (T5) ✓ · flag-drift (T6) ✓. **K1** (derive-at-read + service-role-write) → T2. **K3** (paket unangetastet) → kein paket-Write. **K10** (batch) → T4/T5. **v_netzwerk_freunde-Leak** → T1 Grant service_role-only.
2. **Placeholder-Scan:** keine TBD/„handle edge cases" — alle DDL/TS/Tests konkret.
3. **Typ-Konsistenz:** `ladeZahlendeSvSet`/`ladeFreundKandidatIds`/`istAktivesAbo`/`ZIELROLLE_TO_ENTITY` durchgängig; Set<string> überall.
- **Bewusst NICHT in P0** (dockt auf offene C-Pakete, kommt in P2–P6): Boost-Verdrahtung in beide Engines, „Dein Netzwerk"-Sektion, Provisions-Release-Gate, Bindungs-Seeding (createCase/C2), Vermittlungs-Flow (transitionClaim/C1), Netzwerk-Notifications (Outbox/C3), WS H (eine Akte/C4), Stripe-Recurring.
