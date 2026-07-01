# Artikel-Kommentare — Plan 1: Foundation (DB-Schema, RLS, Identitäts-Validierung)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Datengrundlage für das Kommentar-System anlegen — `community_profiles` + `article_comments` mit RLS — plus die reine, getestete Username-Validierung.

**Architecture:** Zwei neue Postgres-Tabellen (Supabase) hinter Row-Level-Security; eine pure TypeScript-Util für Username-Regeln (verifiziert per vitest). Kein UI, keine Auth-Flows, keine Moderation in diesem Plan — das sind Plan 2–5.

**Tech Stack:** Postgres/Supabase (DDL via Plugin), TypeScript, vitest (Marketing-Suite).

**Spec:** `docs/superpowers/specs/2026-06-29-artikel-kommentare-design.md`

## Global Constraints (verbatim aus Spec + AGENTS.md)

- **DDL ausschließlich über `mcp__plugin_supabase_supabase__apply_migration`** (AGENTS Regel 2) — danach `list_migrations` lesen, File als `supabase/migrations/<V>_<name>.sql` committen (Name == getrackte Version), Spalten per `execute_sql` (READ) verifizieren. **Nie** raw `execute_sql` mit DDL, **nie** CLI `db push`.
- **Nutzersichtbare Strings auf Deutsch mit echten Umlauten** (`ä/ö/ü/ß`).
- **KEINE** user-generierten Artikel — nur Kommentare (Publisher-/RDG-Risiko).
- **Recht/DSGVO = Launch-Gate** (DSE-Update, DPIA-Kurzcheck, Takedown) — blockt NICHT diesen Foundation-Plan, aber den Live-Gang.
- vitest-Tests colocated als `lib/**/*.test.ts` (Marketing-`vitest.config.ts`, `@/`-Alias vorhanden).

## Plan-Sequenz (Roadmap — dieser Plan = Plan 1)

1. **Plan 1 (dieser): Foundation** — DB-Schema + RLS + Username-Util.
2. **Plan 2: Kommentar-Posten + Anzeige** — Marketing-Auth (Magic-Link), Username-Wahl-Flow, `submitComment`-Server-Action, `ArticleComments`-Anzeige (approved, server-rendered). *Braucht Exploration: marketing Supabase-Auth + Server-Action-Pattern + Content-Page-Render-Einbindung.*
3. **Plan 3: Moderation** — App-Portal-Queue (`admin`/`redaktion`), approve/reject/hide/block + Admin-RLS-Policies + trusted/auto-approve. *Braucht Exploration: App-Portal-Rollen-Gating + RLS-Rollen-Mechanik.*
4. **Plan 4: Anti-Spam + Freshness** — Rate-Limit, Turnstile, `revalidatePath` + IndexNow-Ping on approve, `Comment`-JSON-LD.
5. **Plan 5: Recht** — DSE-Abschnitt, Netiquette-Page, Takedown-/Melden-Pfad, DPIA-Kurzcheck (`dpia-sentinel`).

---

### Task 1: Username-Validierung (pure Util + Tests)

Reine, DB-freie Logik zuerst — sofort per vitest testbar, von Plan 2 (Auth-Flow) konsumiert.

**Files:**
- Create: `claimondo-marketing/lib/community/username.ts`
- Test: `claimondo-marketing/lib/community/username.test.ts`

**Interfaces:**
- Produces: `validateUsername(raw: string): { ok: true; username: string } | { ok: false; error: string }` — normalisiert (trim + lowercase), prüft Charset/Länge/Reserviert. Plan 2 ruft das vor dem Profil-Insert.
- Produces: `RESERVED_USERNAMES: ReadonlySet<string>` — für Tests/Wiederverwendung.

- [ ] **Step 1: Failing Test schreiben**

```ts
// claimondo-marketing/lib/community/username.test.ts
import { describe, it, expect } from 'vitest'
import { validateUsername } from './username'

describe('validateUsername', () => {
  it('akzeptiert einen gültigen Namen', () => {
    const r = validateUsername('max_99')
    expect(r.ok).toBe(true)
  })
  it('normalisiert zu lowercase + trim', () => {
    const r = validateUsername('  Max_99 ')
    expect(r).toEqual({ ok: true, username: 'max_99' })
  })
  it('lehnt zu kurze Namen ab (<3)', () => {
    expect(validateUsername('ab').ok).toBe(false)
  })
  it('lehnt zu lange Namen ab (>24)', () => {
    expect(validateUsername('a'.repeat(25)).ok).toBe(false)
  })
  it('lehnt ungültige Zeichen ab', () => {
    expect(validateUsername('max!99').ok).toBe(false)
    expect(validateUsername('max 99').ok).toBe(false)
  })
  it('lehnt reservierte Namen ab (case-insensitive)', () => {
    expect(validateUsername('admin').ok).toBe(false)
    expect(validateUsername('Claimondo').ok).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, FAIL bestätigen**

Run: `cd claimondo-marketing && npm run test`
Expected: FAIL — `Cannot find module './username'`.

- [ ] **Step 3: Minimal-Implementierung**

```ts
// claimondo-marketing/lib/community/username.ts
// Reine Username-Regeln fuer die Community-Kommentare (Spec §Identitaet).
// Eindeutigkeit (UNIQUE) erzwingt die DB; hier nur Form + reservierte Namen.

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'claimondo', 'admin', 'administrator', 'team', 'support', 'mod', 'moderator',
  'anwalt', 'kanzlei', 'gutachter', 'sachverstaendiger', 'root', 'system', 'claimondo-team',
])

const USERNAME_RE = /^[a-z0-9_-]{3,24}$/

export function validateUsername(
  raw: string,
): { ok: true; username: string } | { ok: false; error: string } {
  const username = raw.trim().toLowerCase()
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Nutzername: 3–24 Zeichen, nur a–z, 0–9, _ und –.' }
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, error: 'Dieser Nutzername ist reserviert.' }
  }
  return { ok: true, username }
}
```

- [ ] **Step 4: Test laufen lassen, PASS bestätigen**

Run: `cd claimondo-marketing && npm run test`
Expected: PASS — alle `validateUsername`-Tests grün, Bestandstests unverändert grün.

- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/lib/community/username.ts claimondo-marketing/lib/community/username.test.ts
git commit -m "feat(comments): Username-Validierung (Form + reservierte Namen) + Tests"
```

---

### Task 2: Migration — Tabellen `community_profiles` + `article_comments`

**Files:**
- Apply: via `apply_migration` (Plugin) — name `community_comments_foundation`
- Create (committen NACH `list_migrations`): `supabase/migrations/<V>_community_comments_foundation.sql`

**Interfaces:**
- Produces: Tabellen `public.community_profiles`, `public.article_comments`, Enum `comment_status`. Plan 2/3 schreiben/lesen darüber.

- [ ] **Step 1: DDL anwenden (Plugin)**

`apply_migration({ name: "community_comments_foundation", query: <DDL unten> })`

```sql
create type comment_status as enum ('pending','approved','rejected','hidden');

create table public.community_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  consent_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  is_blocked  boolean not null default false,
  trusted     boolean not null default false,
  constraint username_format check (username ~ '^[a-z0-9_-]{3,24}$')
);

create table public.article_comments (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.community_profiles(user_id) on delete cascade,
  article_slug  text not null,
  body          text not null,
  status        comment_status not null default 'pending',
  parent_id     uuid references public.article_comments(id) on delete cascade,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  moderated_by  uuid references auth.users(id),
  moderated_at  timestamptz,
  constraint body_length check (char_length(body) between 1 and 2000)
);

create index article_comments_by_article on public.article_comments (article_slug, status, created_at desc);
create index article_comments_by_author on public.article_comments (author_id);
```

- [ ] **Step 2: Getrackte Version ablesen**

`list_migrations` → die vom Plugin vergebene Version `<V>` notieren (Plugin setzt EIGENEN Timestamp).

- [ ] **Step 3: Migration-File committen (Name == `<V>`)**

Inhalt = das DDL aus Step 1, Datei `supabase/migrations/<V>_community_comments_foundation.sql`.

```bash
git add supabase/migrations/<V>_community_comments_foundation.sql
git commit -m "feat(comments): Migration community_profiles + article_comments (foundation)"
```

- [ ] **Step 4: Verifizieren (READ)**

`execute_sql({ query: "select table_name from information_schema.tables where table_schema='public' and table_name in ('community_profiles','article_comments');" })`
Expected: beide Tabellen gelistet.

---

### Task 3: RLS-Policies (Insert eigene / Select approved+eigene)

Admin-/Redaktion-Policies kommen in Plan 3 (Moderation) — hier nur der öffentliche/Autor-Pfad.

**Files:**
- Apply: via `apply_migration` — name `community_comments_rls`
- Create: `supabase/migrations/<V>_community_comments_rls.sql`

**Interfaces:**
- Produces: RLS so, dass anon/ssr nur `approved` Kommentare liest, Autoren ihre eigenen sehen/anlegen.

- [ ] **Step 1: RLS-DDL anwenden (Plugin)**

`apply_migration({ name: "community_comments_rls", query: <DDL unten> })`

```sql
alter table public.community_profiles enable row level security;
alter table public.article_comments  enable row level security;

-- Profile: username ist oeffentlich lesbar; eigene Zeile schreiben/aendern
create policy profiles_select_all on public.community_profiles
  for select using (true);
create policy profiles_insert_own on public.community_profiles
  for insert with check (auth.uid() = user_id);
create policy profiles_update_own on public.community_profiles
  for update using (auth.uid() = user_id);

-- Kommentare: oeffentlich nur 'approved'; eigene immer sichtbar
create policy comments_select_approved_or_own on public.article_comments
  for select using (status = 'approved' or author_id = auth.uid());

-- Insert: nur als sich selbst, nicht geblockt (Body-Length deckt der CHECK ab)
create policy comments_insert_own on public.article_comments
  for insert with check (
    auth.uid() = author_id
    and not exists (
      select 1 from public.community_profiles p
      where p.user_id = auth.uid() and p.is_blocked
    )
  );

-- Update: Autor darf eigene Zeile (Body) aendern; Status-Wechsel macht spaeter die Mod-Policy
create policy comments_update_own on public.article_comments
  for update using (author_id = auth.uid());
```

- [ ] **Step 2: Version ablesen + File committen**

`list_migrations` → `<V>` → `supabase/migrations/<V>_community_comments_rls.sql` (Inhalt = Step-1-DDL).

```bash
git add supabase/migrations/<V>_community_comments_rls.sql
git commit -m "feat(comments): RLS-Policies (insert eigene / select approved+eigene)"
```

- [ ] **Step 3: Verifizieren (READ)**

`execute_sql({ query: "select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('community_profiles','article_comments');" })`
Expected: `rowsecurity = true` für beide.

`execute_sql({ query: "select polname, tablename from pg_policies where schemaname='public' and tablename in ('community_profiles','article_comments') order by tablename, polname;" })`
Expected: die 5 Policies oben gelistet.

---

## Self-Review (gegen die Spec)

- **Spec-Coverage Foundation:** Datenmodell (community_profiles + article_comments + enum + indexes) → Task 2 ✓. RLS (anon liest approved, Autor eigene, insert eigene/nicht-geblockt) → Task 3 ✓. Username-Regeln (Form + reserviert) → Task 1 ✓. *Nicht in diesem Plan (bewusst, spätere Pläne):* Auth-Flow, UI, Moderation, Admin-RLS, Anti-Spam, Freshness, Recht.
- **Platzhalter:** keine — jeder Step hat exaktes SQL/TS/Commands + erwartete Outputs.
- **Typ-Konsistenz:** `validateUsername`-Rückgabe-Shape konsistent; `comment_status`-Enum-Werte (`pending/approved/rejected/hidden`) identisch in Spec, Migration, RLS.
- **Konsistenz Util ↔ DB:** `USERNAME_RE` (TS) == `username_format`-CHECK (SQL) == `^[a-z0-9_-]{3,24}$`. Body-Length 1–2000 in TS-Spec == SQL-CHECK.

## Akzeptanz Plan 1

- [ ] `npm run test` (Marketing) grün inkl. neuer Username-Tests.
- [ ] `community_profiles` + `article_comments` existieren, RLS aktiv, 5 Policies vorhanden (execute_sql).
- [ ] Beide Migration-Files committet, Dateiname == getrackte Version.
