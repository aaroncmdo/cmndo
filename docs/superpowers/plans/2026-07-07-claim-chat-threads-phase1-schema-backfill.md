# Claim-Chat Thread-Rebuild — Phase 1: Schema + Backfill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das neue Thread-Datenmodell (2 Tabellen + `nachrichten.thread_id`) anlegen und die bestehenden 165 Chat-Nachrichten idempotent auf Threads backfillen — **rein additiv**, ohne das laufende Kanal-basierte Chat-UI zu ändern.

**Architecture:** `chat_threads` (art ∈ kunde_gruppe/team_intern/direkt, Direkt-Paar via sortierte `direkt_user_a/b`) + `chat_thread_teilnehmer` (Mitglied + `zuletzt_gelesen_am`) + neue FK-Spalte `nachrichten.thread_id`. RLS über Thread-Mitgliedschaft, via SECURITY-DEFINER-Helper `ist_chat_teilnehmer` (rekursionsfrei). Alte `kanal`-Spalte + altes UI bleiben in Phase 1 unverändert.

**Tech Stack:** Supabase Postgres, RLS, `apply_migration`-Plugin. Kein App-Code in Phase 1 (kein Consumer → Typen-Regen aufgeschoben, Regel 2 Schritt 6).

## Global Constraints

- **DDL ausschließlich über `mcp__plugin_supabase_supabase__apply_migration`** (Regel 2). Kein `execute_sql` mit DDL, keine CLI.
- **Nach jeder Tabelle `REVOKE ALL ... FROM anon`** (Leak-Lehre v_partner_billing).
- **Migrations-Version:** nach jedem `apply_migration` → `list_migrations` bzw. `select version from supabase_migrations.schema_migrations order by version desc limit 3` → committetes File `supabase/migrations/<version>_<name>.sql` **exakt** nach getrackter Version benennen (Twin-Drift-Vermeidung, Regel 2 Schritt 3+4).
- **Backfill idempotent** (`on conflict do nothing` / `where thread_id is null`), **nur** Nachrichten mit `fall_id in claims` (4 verwaiste fall_ids überspringen).
- **`execute_sql` nur READ** (Verifikation).
- Branch: `kitta/claim-chat-threads-rebuild` (off staging), Worktree `…/werkstatt-login-mail`.

**Datenlage (Read-Only-Verifikation 2026-07-07):** `nachrichten` = 165 Zeilen: `whatsapp` 147 (1 Claim), `gruppenchat` 18 (18 Claims); die 4 Rollenpaar-DM-Kanäle **leer**; `sender_id`/`empfaenger_id` **nie** gesetzt. `claims` = 28 (24 mit KB, 13 mit `geschaedigter_user_id`). Zuweisungen: `claims.{kundenbetreuer_id, sv_id, makler_id, geschaedigter_user_id, lead_id}`. `nachrichten.fall_id → claims.id` (18 distinct, 14 in claims).

---

## File Structure

- `supabase/migrations/<v1>_chat_threads_schema.sql` — Helper-Funktion + beide Tabellen + Indizes + RLS + Grants.
- `supabase/migrations/<v2>_nachrichten_thread_id.sql` — additive FK-Spalte + Index auf `nachrichten`.
- `supabase/migrations/<v3>_chat_threads_backfill.sql` — idempotenter Backfill der 165 Nachrichten.

Kein weiterer Code in Phase 1.

---

### Task 1: Schema — `chat_threads` + `chat_thread_teilnehmer` + Membership-Helper

**Files:**
- Create: `supabase/migrations/<v1>_chat_threads_schema.sql` (Version nach `apply_migration` ablesen)

**Interfaces:**
- Produces: Tabellen `public.chat_threads(id, claim_id, art, direkt_user_a, direkt_user_b, erstellt_am)`, `public.chat_thread_teilnehmer(thread_id, user_id, rolle, zuletzt_gelesen_am, hinzugefuegt_am)`, Funktion `public.ist_chat_teilnehmer(p_thread_id uuid) returns boolean`.

- [ ] **Step 1: DDL via Plugin anwenden**

`apply_migration({ name: "chat_threads_schema", query: <DDL> })` mit:

```sql
-- Membership-Helper (SECURITY DEFINER -> rekursionsfrei in RLS-Policies)
create or replace function public.ist_chat_teilnehmer(p_thread_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.chat_thread_teilnehmer t
    where t.thread_id = p_thread_id and t.user_id = auth.uid()
  );
$$;
revoke all on function public.ist_chat_teilnehmer(uuid) from anon;
grant execute on function public.ist_chat_teilnehmer(uuid) to authenticated;

-- chat_threads
create table if not exists public.chat_threads (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.claims(id) on delete cascade,
  art           text not null check (art in ('kunde_gruppe','team_intern','direkt')),
  direkt_user_a uuid,   -- nur direkt: kleinere user-id (sortiert)
  direkt_user_b uuid,   -- nur direkt: groessere user-id
  erstellt_am   timestamptz not null default now(),
  constraint chat_threads_direkt_paar_chk
    check ((art = 'direkt') = (direkt_user_a is not null and direkt_user_b is not null)),
  constraint chat_threads_direkt_sortiert_chk
    check (direkt_user_a is null or direkt_user_a < direkt_user_b)
);
create unique index if not exists chat_threads_gruppe_uniq
  on public.chat_threads (claim_id, art) where art in ('kunde_gruppe','team_intern');
create unique index if not exists chat_threads_direkt_uniq
  on public.chat_threads (claim_id, direkt_user_a, direkt_user_b) where art = 'direkt';
create index if not exists chat_threads_claim_idx on public.chat_threads (claim_id);

alter table public.chat_threads enable row level security;
revoke all on public.chat_threads from anon;
grant select, insert on public.chat_threads to authenticated;
create policy chat_threads_select on public.chat_threads for select to authenticated
  using (public.is_staff() or public.ist_chat_teilnehmer(id));
create policy chat_threads_insert on public.chat_threads for insert to authenticated
  with check (public.is_staff());

-- chat_thread_teilnehmer
create table if not exists public.chat_thread_teilnehmer (
  thread_id          uuid not null references public.chat_threads(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  rolle              text,
  zuletzt_gelesen_am timestamptz,
  hinzugefuegt_am    timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists chat_thread_teilnehmer_user_idx on public.chat_thread_teilnehmer (user_id);

alter table public.chat_thread_teilnehmer enable row level security;
revoke all on public.chat_thread_teilnehmer from anon;
grant select, insert, update on public.chat_thread_teilnehmer to authenticated;
-- SELECT: eigene Zeilen + Staff (Co-Member-Sicht kommt in Phase 2 via Helper — kein Self-Join = keine Rekursion)
create policy chat_teilnehmer_select on public.chat_thread_teilnehmer for select to authenticated
  using (public.is_staff() or user_id = auth.uid());
create policy chat_teilnehmer_insert on public.chat_thread_teilnehmer for insert to authenticated
  with check (public.is_staff());
create policy chat_teilnehmer_update_own on public.chat_thread_teilnehmer for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Getrackte Version ablesen**

Run: `execute_sql("select version, name from supabase_migrations.schema_migrations order by version desc limit 3")`
Expected: die neue `chat_threads_schema`-Version `<v1>` erscheint oben.

- [ ] **Step 3: Migration-File committen (Name == Version)**

Schreibe die DDL aus Step 1 nach `supabase/migrations/<v1>_chat_threads_schema.sql`, dann:
```bash
git add "supabase/migrations/<v1>_chat_threads_schema.sql"
git commit -m "feat(chat): Phase1 Schema — chat_threads + chat_thread_teilnehmer + ist_chat_teilnehmer (RLS, anon REVOKE)"
```

- [ ] **Step 4: Verifizieren — Tabellen + anon gesperrt + RLS an**

Run:
```sql
select
  (select count(*) from information_schema.tables where table_schema='public' and table_name in ('chat_threads','chat_thread_teilnehmer')) as tabellen,
  (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('chat_threads','chat_thread_teilnehmer') and grantee='anon') as anon_grants,
  (select count(*) from pg_class where relname in ('chat_threads','chat_thread_teilnehmer') and relrowsecurity) as rls_an,
  (select count(*) from pg_policies where schemaname='public' and tablename in ('chat_threads','chat_thread_teilnehmer')) as policies;
```
Expected: `tabellen=2, anon_grants=0, rls_an=2, policies=5`.

---

### Task 2: `nachrichten.thread_id` — additive FK-Spalte

**Files:**
- Create: `supabase/migrations/<v2>_nachrichten_thread_id.sql`

**Interfaces:**
- Consumes: `public.chat_threads` (Task 1).
- Produces: Spalte `public.nachrichten.thread_id uuid` (FK → chat_threads), Index `idx_nachrichten_thread`.

- [ ] **Step 1: DDL via Plugin anwenden**

`apply_migration({ name: "nachrichten_thread_id", query: <DDL> })`:
```sql
alter table public.nachrichten
  add column if not exists thread_id uuid references public.chat_threads(id) on delete set null;
create index if not exists idx_nachrichten_thread on public.nachrichten (thread_id, created_at desc);
```
> Keine RLS-Änderung an `nachrichten` in Phase 1 — die bestehende `kanal`-basierte RLS + das alte UI bleiben unangetastet (rein additiv).

- [ ] **Step 2: Version ablesen + File committen**

Run: `execute_sql("select version from supabase_migrations.schema_migrations order by version desc limit 2")` → `<v2>`.
Schreibe DDL nach `supabase/migrations/<v2>_nachrichten_thread_id.sql`, dann:
```bash
git add "supabase/migrations/<v2>_nachrichten_thread_id.sql"
git commit -m "feat(chat): Phase1 — nachrichten.thread_id (additive FK, kein RLS-Change)"
```

- [ ] **Step 3: Verifizieren**

Run:
```sql
select count(*) as spalte from information_schema.columns
where table_schema='public' and table_name='nachrichten' and column_name='thread_id';
```
Expected: `spalte=1`.

---

### Task 3: Backfill — 165 Nachrichten auf Threads mappen (idempotent)

**Files:**
- Create: `supabase/migrations/<v3>_chat_threads_backfill.sql`

**Interfaces:**
- Consumes: Task 1 + Task 2 Schema; `public.claims.{geschaedigter_user_id, kundenbetreuer_id, sv_id}`.
- Produces: befüllte `chat_threads`/`chat_thread_teilnehmer` + gesetzte `nachrichten.thread_id`.

- [ ] **Step 1: Read-Only-Erwartung festhalten (vor dem Insert)**

Run:
```sql
select
  (select count(distinct fall_id) from public.nachrichten n join public.claims c on c.id=n.fall_id where n.kanal in ('gruppenchat','whatsapp')) as erwartete_kunde_gruppen,
  (select count(distinct c.id) from public.nachrichten n join public.claims c on c.id=n.fall_id
     where n.kanal='whatsapp' and c.geschaedigter_user_id is not null and c.kundenbetreuer_id is not null
       and c.geschaedigter_user_id <> c.kundenbetreuer_id) as erwartete_direkt,
  (select count(*) from public.nachrichten n join public.claims c on c.id=n.fall_id where n.kanal in ('gruppenchat','whatsapp')) as erwartete_mit_thread;
```
Notiere die 3 Zahlen (Soll-Werte für Step 3-Verifikation).

- [ ] **Step 2: Backfill via Plugin anwenden**

`apply_migration({ name: "chat_threads_backfill", query: <SQL> })`:
```sql
-- 1) kunde_gruppe-Thread je Claim mit gruppenchat- ODER whatsapp-Nachrichten (verwaiste fall_ids via JOIN raus)
insert into public.chat_threads (claim_id, art)
select distinct n.fall_id, 'kunde_gruppe'
from public.nachrichten n
join public.claims c on c.id = n.fall_id
where n.kanal in ('gruppenchat','whatsapp')
on conflict do nothing;

-- 2) kunde_gruppe-Teilnehmer: Kunde + KB + SV (non-null, distinct)
insert into public.chat_thread_teilnehmer (thread_id, user_id, rolle)
select th.id, u.uid, u.rolle
from public.chat_threads th
join public.claims c on c.id = th.claim_id
cross join lateral (values
  (c.geschaedigter_user_id, 'kunde'),
  (c.kundenbetreuer_id, 'kundenbetreuer'),
  (c.sv_id, 'sachverstaendiger')
) as u(uid, rolle)
where th.art = 'kunde_gruppe' and u.uid is not null
on conflict (thread_id, user_id) do nothing;

-- 3) gruppenchat -> kunde_gruppe-Thread
update public.nachrichten n
set thread_id = th.id
from public.chat_threads th
where th.claim_id = n.fall_id and th.art = 'kunde_gruppe'
  and n.kanal = 'gruppenchat' and n.thread_id is null;

-- 4a) direkt(Kunde,KB)-Thread fuer whatsapp-Claims mit beiden user-ids
insert into public.chat_threads (claim_id, art, direkt_user_a, direkt_user_b)
select distinct c.id, 'direkt',
  least(c.geschaedigter_user_id, c.kundenbetreuer_id),
  greatest(c.geschaedigter_user_id, c.kundenbetreuer_id)
from public.nachrichten n
join public.claims c on c.id = n.fall_id
where n.kanal = 'whatsapp'
  and c.geschaedigter_user_id is not null and c.kundenbetreuer_id is not null
  and c.geschaedigter_user_id <> c.kundenbetreuer_id
on conflict do nothing;

-- 4b) direkt-Teilnehmer
insert into public.chat_thread_teilnehmer (thread_id, user_id, rolle)
select th.id, u.uid, u.rolle
from public.chat_threads th
join public.claims c on c.id = th.claim_id
cross join lateral (values
  (th.direkt_user_a, case when th.direkt_user_a = c.geschaedigter_user_id then 'kunde' else 'kundenbetreuer' end),
  (th.direkt_user_b, case when th.direkt_user_b = c.geschaedigter_user_id then 'kunde' else 'kundenbetreuer' end)
) as u(uid, rolle)
where th.art = 'direkt'
on conflict (thread_id, user_id) do nothing;

-- 4c) whatsapp -> direkt-Thread (wenn vorhanden)
update public.nachrichten n
set thread_id = th.id
from public.claims c
join public.chat_threads th on th.claim_id = c.id and th.art = 'direkt'
  and th.direkt_user_a = least(c.geschaedigter_user_id, c.kundenbetreuer_id)
  and th.direkt_user_b = greatest(c.geschaedigter_user_id, c.kundenbetreuer_id)
where c.id = n.fall_id and n.kanal = 'whatsapp' and n.thread_id is null;

-- 4d) whatsapp-Rest (kein direkt moeglich, z.B. Kunde ohne user-id) -> kunde_gruppe
update public.nachrichten n
set thread_id = th.id
from public.chat_threads th
where th.claim_id = n.fall_id and th.art = 'kunde_gruppe'
  and n.kanal = 'whatsapp' and n.thread_id is null;
```

- [ ] **Step 3: Version ablesen + File committen**

Run: `execute_sql("select version from supabase_migrations.schema_migrations order by version desc limit 2")` → `<v3>`.
Schreibe SQL nach `supabase/migrations/<v3>_chat_threads_backfill.sql`, dann:
```bash
git add "supabase/migrations/<v3>_chat_threads_backfill.sql"
git commit -m "feat(chat): Phase1 Backfill — 165 Nachrichten idempotent auf Threads (gruppenchat->kunde_gruppe, whatsapp->direkt)"
```

- [ ] **Step 4: Verifizieren gegen die Soll-Werte aus Step 1**

Run:
```sql
select
  (select count(*) from public.chat_threads where art='kunde_gruppe') as kunde_gruppen,
  (select count(*) from public.chat_threads where art='direkt') as direkt,
  (select count(*) from public.nachrichten where kanal in ('gruppenchat','whatsapp') and thread_id is not null) as mit_thread,
  (select count(*) from public.nachrichten where kanal in ('gruppenchat','whatsapp') and fall_id in (select id from public.claims) and thread_id is null) as unmapped_trotz_claim;
```
Expected: `kunde_gruppen` = erwartete_kunde_gruppen (Step 1), `direkt` = erwartete_direkt, `mit_thread` = erwartete_mit_thread, **`unmapped_trotz_claim = 0`**.

- [ ] **Step 5: Idempotenz-Check (Backfill zweimal = keine Duplikate)**

`apply_migration` erneut mit demselben Backfill-SQL (oder `execute_sql` READ der 4c/4d-UPDATEs, die durch `thread_id is null` no-op sind). Danach Step-4-Query wiederholen → **identische Zahlen** (keine Doppel-Threads/-Teilnehmer).

---

## Self-Review

**Spec coverage:** §3 Datenmodell → Task 1+2 (Tabellen, thread_id, RLS über `ist_chat_teilnehmer`, anon REVOKE) ✓. §6 Migration → Task 3 (gruppenchat→kunde_gruppe, whatsapp→direkt(Kunde,Betreuer), verwaiste fall_ids raus, idempotent) ✓. §8 Entscheidungen: whatsapp→direkt(Kunde,KB) ✓, lazy Anlage → Phase 2 (Phase 1 legt nur Backfill-Threads an) ✓, team_intern nur KB+SV → Phase 1 legt team_intern-Threads noch nicht an (keine chat_kb_sv-Daten vorhanden; team_intern entsteht lazy in Phase 2) — **bewusst**: es gibt 0 zu migrierende interne Nachrichten. `direkt(Makler,Betreuer)` → keine Makler-Nachrichten vorhanden, entfällt in Phase-1-Backfill.

**Placeholder-Scan:** `<v1>/<v2>/<v3>` sind bewusst zur Laufzeit vom Plugin vergebene Versionen (Regel 2) — keine Code-Placeholder. Alle SQL-Blöcke vollständig.

**Type-Konsistenz:** `ist_chat_teilnehmer(uuid)->bool` in Task 1 definiert, in RLS `chat_threads_select` genutzt. Spalten `direkt_user_a/b` in Task 1 definiert, in Task-3-Backfill (4a/4c) konsistent per `least/greatest` referenziert.

---

## Nächste Phasen (eigene Pläne)
- **Phase 2:** `sendChatMessage`/Reader auf `thread_id`; lazy Thread-Anlage (team_intern, direkt on-demand inkl. Werkstatt/Makler); Zustellung WhatsApp/E-Mail pro Mitglied; neues Gruppe+DM-UI hinter Feature-Flag portalweise (inkl. Werkstatt/Kanzlei). Co-Member-Sicht-RLS via SECURITY-DEFINER-Helper.
- **Phase 3:** Cutover, alte `kanal`-Logik/Files raus, `nachrichten.kanal` droppen, Reply-Kontext-Routing (WhatsApp-Antwort dem Ursprungs-Thread zuordnen).
