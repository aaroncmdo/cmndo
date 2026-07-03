# Universelles Kalender-Sync-Fundament (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den externen Kalender-Sync (CalDAV + Google, OUT **und** IN) von SV-only auf **assignee-generisch** heben, sodass jede Rolle mit einer Verbindung (zuerst Kundenbetreuer) ihre Termine extern sieht + ihre externe Belegung Claimondo-Slots blockt.

**Architecture:** Ein zentraler `resolveAssigneeProfileId`-Resolver mappt `(assignee_typ, assignee_id) → profile_id`. Eine neue profil-gekeyte `kalender_verbindungen`-Tabelle ersetzt die SV-only `sv_kalender_verbindungen` als CalDAV-Quelle (Google bleibt auf `profiles.google_*`). Die Engine-Provider (`googleProvider`/`caldavProvider`) droppen den `assignee_typ==='sachverstaendiger'`-Gate und lösen die Verbindung per profile_id auf. Der IN-Sync-Cron + `sv_kalender_events_cache` + `v_belegung` werden profil-fähig.

**Tech Stack:** TypeScript, Supabase (Postgres, `apply_migration`-Plugin), Next.js 16, vitest, `googleapis`, CalDAV-Client (`src/lib/kalender/caldav/*`).

## Global Constraints

- **DDL nur über `apply_migration` (Plugin)** → `list_migrations` → File `supabase/migrations/<V>_<name>.sql` == getrackte Version (Regel 2). `execute_sql` nur READ. **Rein additiv, keine Drops** in SP1 (SV-Bestand läuft weiter; `sv_kalender_verbindungen`-Drop = separater Cleanup nach Verifikation, Regel 3).
- **Kein Export von Konstanten/Non-async aus `'use server'`** — Helper leben in normalen Modulen.
- **Fail-soft je Provider** (try/catch → `results[provider]='error'` + `console.error`); unbekannter assignee_typ / kein Profil / keine Verbindung → `'skip'`, kein Fehler.
- **Google bleibt auf `profiles.google_*`** (via `getGoogleOAuthClientForUser(profileId)`) — nicht in die neue Tabelle migrieren.
- **Umlaute** in nutzersichtbaren Strings (hier kaum UI — Backend). Ratchets token-audit/component-set/knip grün.
- **Build 8 GB** (`NODE_OPTIONS=--max-old-space-size=8192 npm run build`).

---

## File Structure

| File | Verantwortung | Änderung |
|---|---|---|
| `supabase/migrations/<V>_universal_kalender_verbindungen.sql` | `kalender_verbindungen`-Tabelle + `sv_kalender_events_cache.profile_id` + Backfills | **Create** (via apply_migration) |
| `src/lib/termine/engine/assignee-profile.ts` | `resolveAssigneeProfileId` (assignee → profile_id) | **Create** |
| `src/lib/termine/engine/__tests__/assignee-profile.test.ts` | Unit-Tests | **Create** |
| `src/lib/termine/engine/kalender-sync.ts` | Provider generalisieren (Resolver + `kalender_verbindungen`; SV-Gate raus) | **Modify** |
| `src/lib/termine/engine/kalender-kontext.ts` | Nicht-SV-Termin-Kontext härten | **Modify** |
| `src/lib/kalender/sync-to-cache.ts` | IN-Sync-Cron + cache-Ops profil-fähig | **Modify** |
| `supabase/migrations/<V>_v_belegung_profile_generic.sql` | `v_belegung` External-Teil profil-generisch | **Create** (via apply_migration) |

---

### Task 1: Migration — `kalender_verbindungen` + Cache-`profile_id`

**Files:**
- Create: `supabase/migrations/<V>_universal_kalender_verbindungen.sql` (Dateiname == von `list_migrations` gemeldete Version)

**Interfaces:**
- Produces: Tabelle `kalender_verbindungen(id, profile_id, provider, server_url, username, password_encrypted, calendar_url, last_error, last_error_at, erstellt_am)` mit `unique(profile_id, provider)`; Spalte `sv_kalender_events_cache.profile_id uuid`.

- [ ] **Step 1: DDL via `apply_migration`**

`apply_migration({ name: "universal_kalender_verbindungen", query: <DDL> })`:

```sql
create table if not exists kalender_verbindungen (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('caldav')),
  server_url text,
  username text,
  password_encrypted text,
  calendar_url text,
  last_error text,
  last_error_at timestamptz,
  erstellt_am timestamptz not null default now(),
  unique (profile_id, provider)
);
create index if not exists idx_kalender_verbindungen_profile on kalender_verbindungen(profile_id);

-- Backfill: bestehende SV-CalDAV-Verbindungen (sv_id -> profile_id via sachverstaendige)
insert into kalender_verbindungen (profile_id, provider, server_url, username, password_encrypted, calendar_url, last_error, last_error_at)
select s.profile_id, v.provider, v.server_url, v.username, v.password_encrypted, v.calendar_url, v.last_error, v.last_error_at
from sv_kalender_verbindungen v
join sachverstaendige s on s.id = v.sv_id
where v.provider = 'caldav' and s.profile_id is not null
on conflict (profile_id, provider) do nothing;

-- IN-Sync-Cache profil-fähig (additiv)
alter table sv_kalender_events_cache add column if not exists profile_id uuid;
update sv_kalender_events_cache c set profile_id = s.profile_id
from sachverstaendige s where s.id = c.sv_id and c.profile_id is null;
create index if not exists idx_sv_kalender_events_cache_profile on sv_kalender_events_cache(profile_id);
```

- [ ] **Step 2: Getrackte Version ablesen + File benennen**

Run: `list_migrations` → Version `<V>` ablesen. File committen als `supabase/migrations/<V>_universal_kalender_verbindungen.sql` mit **exakt** obigem DDL (Regel 2, Schritt 3+4 gegen Twin-Drift).

- [ ] **Step 3: READ-Verifikation**

Run (`execute_sql`, READ):
```sql
select count(*) as verbindungen from kalender_verbindungen;
select count(*) as cache_mit_profile from sv_kalender_events_cache where profile_id is not null;
```
Expected: `verbindungen` = Anzahl SV-CalDAV-Verbindungen (aktuell 4); `cache_mit_profile` > 0 (Backfill).

- [ ] **Step 4: Commit**
```bash
git add "supabase/migrations/<V>_universal_kalender_verbindungen.sql"
git commit -m "feat(kalender): universal kalender_verbindungen + cache profile_id (additiv)"
```

**Hinweis Provider-Enum:** `check (provider in ('caldav'))` bewusst eng — Google bleibt auf profiles; `microsoft` etc. werden in SP5 per weiterer additiver Migration ergänzt (`… drop constraint … ; add constraint … in ('caldav','microsoft')`).

---

### Task 2: `resolveAssigneeProfileId`

**Files:**
- Create: `src/lib/termine/engine/assignee-profile.ts`
- Test: `src/lib/termine/engine/__tests__/assignee-profile.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` (admin).
- Produces: `resolveAssigneeProfileId(db, assigneeTyp: string | null, assigneeId: string | null): Promise<string | null>` — sachverstaendiger→`sachverstaendige.profile_id`; kundenbetreuer→`assigneeId` (ist schon profile_id); sonst→`null`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveAssigneeProfileId } from '../assignee-profile'

function fakeDb(svProfile: string | null) {
  return {
    from: (t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === 'sachverstaendige' ? { profile_id: svProfile } : null }) }) }),
    }),
  } as unknown as Parameters<typeof resolveAssigneeProfileId>[0]
}

describe('resolveAssigneeProfileId', () => {
  it('sachverstaendiger -> sachverstaendige.profile_id', async () => {
    expect(await resolveAssigneeProfileId(fakeDb('p-sv'), 'sachverstaendiger', 'sv-1')).toBe('p-sv')
  })
  it('kundenbetreuer -> assigneeId (ist profile_id)', async () => {
    expect(await resolveAssigneeProfileId(fakeDb(null), 'kundenbetreuer', 'p-kb')).toBe('p-kb')
  })
  it('unbekannter Typ -> null', async () => {
    expect(await resolveAssigneeProfileId(fakeDb(null), 'kanzlei', 'x')).toBeNull()
  })
  it('null-inputs -> null', async () => {
    expect(await resolveAssigneeProfileId(fakeDb(null), null, null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — FAIL** — `npx vitest run assignee-profile` → „resolveAssigneeProfileId is not a function".

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Mappt einen Termin-assignee auf das profile_id, dem die Kalender-Verbindung gehört.
 * sachverstaendiger: assignee_id = sachverstaendige.id → profile_id (join).
 * kundenbetreuer:   assignee_id ist bereits die profiles.id.
 * kanzlei/werkstatt: in SP3/SP4 ergänzen — bis dahin null (= Provider-skip).
 */
export async function resolveAssigneeProfileId(
  db: SupabaseClient,
  assigneeTyp: string | null,
  assigneeId: string | null,
): Promise<string | null> {
  if (!assigneeTyp || !assigneeId) return null
  if (assigneeTyp === 'kundenbetreuer') return assigneeId
  if (assigneeTyp === 'sachverstaendiger') {
    const { data } = await db.from('sachverstaendige').select('profile_id').eq('id', assigneeId).maybeSingle()
    return (data?.profile_id as string | null) ?? null
  }
  return null
}
```

- [ ] **Step 4: Run — PASS** — `npx vitest run assignee-profile` (4/4).
- [ ] **Step 5: Commit** — `git add src/lib/termine/engine/assignee-profile.ts src/lib/termine/engine/__tests__/assignee-profile.test.ts && git commit -m "feat(kalender): resolveAssigneeProfileId (assignee -> profile_id)"`

---

### Task 3: OUT-Sync — Provider generalisieren (`kalender-sync.ts`)

**Files:**
- Modify: `src/lib/termine/engine/kalender-sync.ts`
- Test: `src/lib/termine/engine/__tests__/kalender-sync.test.ts` (Orchestrierungs-Tests erweitern)

**Interfaces:**
- Consumes: `resolveAssigneeProfileId` (Task 2); `kalender_verbindungen` (Task 1); `getGoogleOAuthClientForUser(profileId)` (unverändert).
- Produces: `googleProvider`/`caldavProvider` funktionieren für **jeden** assignee_typ, der auf ein Profil mit Verbindung auflöst.

- [ ] **Step 1: `svProfileId` → `resolveAssigneeProfileId`, `caldavConn(svId)` → profile-basiert.**

In `kalender-sync.ts`:
- Import ergänzen: `import { resolveAssigneeProfileId } from './assignee-profile'`.
- `svProfileId`-Helper **löschen**; alle Aufrufe durch `resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id)` ersetzen.
- `caldavConn(db, svId)` umbauen auf `caldavConn(db, profileId)` → liest `kalender_verbindungen` per `profile_id`:

```ts
async function caldavConn(db: SupabaseClient, profileId: string): Promise<CalDavConn | null> {
  const { data } = await db
    .from('kalender_verbindungen')
    .select('server_url, username, password_encrypted, calendar_url')
    .eq('profile_id', profileId)
    .eq('provider', 'caldav')
    .maybeSingle()
  if (!data || !data.calendar_url) return null
  return data as CalDavConn
}
```
- In `googleProvider.upsert/remove`: `if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id) return 'skip'` → `const profileId = await resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id); if (!profileId) return 'skip'` und `getGoogleOAuthClientForUser(profileId)`.
- In `caldavProvider.upsert/remove`: analog → `const profileId = await resolveAssigneeProfileId(...); if (!profileId) return 'skip'; const conn = await caldavConn(db, profileId)`. Bei `auth_failed`: `kalender_verbindungen`-Row (per profile_id + provider) `last_error` setzen (statt `sv_kalender_verbindungen`).

- [ ] **Step 2: SV-Gate im Orchestrator raus.**

In `syncTerminToExternalCalendar` (Z.~191): `if (termin.assignee_typ !== 'sachverstaendiger') return { ok: true, results: alleSkip(providers) }` **entfernen** — die Provider self-gaten via Resolver (kein Doppel-Gate). `AKTIV_STATUS`-Gate bleibt.

- [ ] **Step 3: Orchestrierungs-Tests erweitern** — im bestehenden `kalender-sync.test.ts` einen Fake-Provider-Test ergänzen, der einen `assignee_typ:'kundenbetreuer'`-Termin **nicht** mehr skippt (heute skippt der Orchestrator ihn hart).

- [ ] **Step 4: tsc + vitest** — `npx tsc --noEmit` (0) · `npx vitest run kalender-sync` (grün).
- [ ] **Step 5: Commit** — `git add … && git commit -m "feat(kalender): OUT-Sync assignee-generisch (Resolver + kalender_verbindungen, SV-Gate raus)"`

---

### Task 4: Kontext für Nicht-SV-Termine härten (`kalender-kontext.ts`)

**Files:**
- Modify: `src/lib/termine/engine/kalender-kontext.ts`
- Test: `src/lib/termine/engine/__tests__/kalender-sync.test.ts` (Kontext-Zweig)

**Interfaces:**
- Produces: `resolveTerminKontext` liefert für `kb_beratung`/Nicht-SV-Termine einen sinnvollen Fallback-Titel statt leer/Crash.

- [ ] **Step 1: Kontext-Read prüfen** — `kalender-kontext.ts` lesen: baut `buildSummary`/`buildDescription` heute claim/SV-zentrisch? Für `typ='kb_beratung'` (bezug lead/claim) einen Titel wie „Beratungstermin — {Kunde}" liefern; kein `bezug` → generischer Titel „Claimondo-Termin".
- [ ] **Step 2: Failing test** — Kontext für ein kb_beratung-Termin-Shape (kein SV-claim) → nicht-leerer summary.
- [ ] **Step 3: Implement** — Fallback-Zweig in `buildSummary` (Nicht-SV/kein-bezug → generischer Titel).
- [ ] **Step 4: vitest PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(kalender): Kontext-Fallback für Nicht-SV-Termine (kb_beratung)"`

---

### Task 5: IN-Sync-Cron + Cache profil-fähig (`sync-to-cache.ts`)

**Files:**
- Modify: `src/lib/kalender/sync-to-cache.ts`

**Interfaces:**
- Produces: `syncAllExternalCalendars` iteriert **alle Profile mit Verbindung** (Google via `profiles.google_refresh_token`, CalDAV via `kalender_verbindungen`); Cache-Rows tragen `profile_id`.

- [ ] **Step 1: Cache-Ops von `sv_id` auf `profile_id` heben.** `CacheRow`/`diffAndApply`/`pruneStaleExternalEvents` bekommen `profileId` statt `svId`; Filter + Insert nutzen `profile_id` (die `sv_id`-Spalte bleibt additiv befüllt wo bekannt, ist aber nicht mehr der Key). Upsert-`onConflict` bleibt auf `sv_id,source,external_event_id` (Bestand) — zusätzlich `profile_id` mitschreiben; ein späterer Cleanup kann den Unique-Index auf `profile_id,source,external_event_id` umstellen.
- [ ] **Step 2: Google-Iteration generalisieren.** Statt `profiles … sachverstaendige!inner` → **alle** `profiles` mit `google_refresh_token is not null`. Pro Profil: `syncGoogle(profileId, db)` (nur noch profileId, kein svId).
- [ ] **Step 3: CalDAV-Iteration generalisieren.** Statt `sv_kalender_verbindungen` → `kalender_verbindungen` (`provider='caldav'`, `last_error is null`), pro Row `profile_id` nutzen.
- [ ] **Step 4: tsc + Verifikation** — `npx tsc --noEmit` (0). (Cron-Lauf = Prod-Smoke in Task 7.)
- [ ] **Step 5: Commit** — `git commit -m "feat(kalender): IN-Sync-Cron + Cache profil-fähig (alle Rollen mit Verbindung)"`

---

### Task 6: `v_belegung` External-Teil profil-generisch (Migration)

**Files:**
- Create: `supabase/migrations/<V>_v_belegung_profile_generic.sql` (via apply_migration)

**Interfaces:**
- Produces: `v_belegung`-External-Union attribuiert Cache-Events per Profil an den korrekten `(assignee_typ, assignee_id)` — SV: profile → sachverstaendige.id; KB: profile_id IST assignee_id.

- [ ] **Step 1: `create or replace view v_belegung`** — den 2. UNION-Zweig (aktuell `'sachverstaendiger', c.sv_id … from sv_kalender_events_cache`) ersetzen durch profil-generische Attribution:

```sql
-- externe Belegung, attribuiert an die Rolle des Profils:
select
  case when s.id is not null then 'sachverstaendiger' else 'kundenbetreuer' end as assignee_typ,
  coalesce(s.id, c.profile_id) as assignee_id,
  c.start_zeit, c.end_zeit, 'extern'::text as belegung_typ,
  null::text, null::text, null::text, null::uuid,
  coalesce(s.standort_lat, null), coalesce(s.standort_lng, null),
  c.id as quelle_id
from sv_kalender_events_cache c
left join sachverstaendige s on s.profile_id = c.profile_id
```
(Die anderen zwei UNION-Zweige unverändert lassen; die vollständige `create or replace view`-Definition = aktueller Viewdef mit ersetztem External-Zweig.) Fällt ein Profil auf keine Rolle zurück, bleibt `kundenbetreuer`/`c.profile_id` — die per-Rollen-Konsumenten filtern nach ihrer `assignee_id`.

- [ ] **Step 2: apply_migration + list_migrations + File==Version + READ-Verify** (`select assignee_typ, count(*) from v_belegung where belegung_typ='extern' group by 1`).
- [ ] **Step 3: Commit** — `git commit -m "feat(kalender): v_belegung External-Teil profil-generisch (SV+KB)"`

---

### Task 7: Verifikation & Prod-Smoke

**Files:** keine.

- [ ] **Step 1: Gates** — `npx vitest run assignee-profile kalender-sync` (grün) · `npx tsc --noEmit` (0) · voller `npm run build` (8 GB, exit 0) · `npm run check:token-audit` / `check:component-set -- --ratchet` / `check:knip -- --ratchet` (0 neu).
- [ ] **Step 2: OUT-Smoke (Prod-DB, Test-KB-Profil mit CalDAV):** Test-Profil (KB) eine `kalender_verbindungen`-CalDAV-Row geben (Test-iCloud); einen `kundenbetreuer`-Termin (gutachter_termine) `bestaetigt` anlegen → `syncSvTerminToCalDav`/`syncTerminToExternalCalendar(terminId)` → `caldav_object_url` gesetzt (echter iCloud-Event). Danach `entferneTerminAusExternemKalender` + Testdaten 0-Rest cleanen. **Nur Test-Accounts.**
- [ ] **Step 3: IN-Smoke:** Cron-Fn `syncAllExternalCalendars()` (throwaway-Route) → Cache-Rows mit `profile_id` des Test-KB; `select … from v_belegung where assignee_typ='kundenbetreuer' and belegung_typ='extern'` zeigt die externe Belegung. Cleanen.
- [ ] **Step 4:** Marker + PR gegen staging.

---

## Self-Review

**Spec-Coverage:** ① Resolver→Task 2 · ② Datenmodell→Task 1 · ③ OUT-Provider→Task 3 · ④ IN-Cron/Cache→Task 5, IN-Belegung→Task 6 · ⑤ Kontext→Task 4 · Verifikation→Task 7. Alle 5 SP1-Komponenten abgedeckt. ✅
**Placeholder-Scan:** DDL/Code vollständig; die kanzlei/werkstatt-Auflösung ist bewusste SP3/4-Deferral (`return null` = skip), kein TBD. ✅
**Typ-Konsistenz:** `resolveAssigneeProfileId(db, typ, id): Promise<string|null>` konsistent Task 2↔3↔5. `caldavConn(db, profileId)` konsistent. `kalender_verbindungen`-Spalten konsistent Task 1↔3↔5↔6. ✅
**Scope:** Fundament + KB funktionsfähig; kanzlei/dispatch/werkstatt-Wiring + Connect-UI + Outlook = SP2–SP5 (Spec). `sv_kalender_verbindungen`-Drop = separater Cleanup. ✅
