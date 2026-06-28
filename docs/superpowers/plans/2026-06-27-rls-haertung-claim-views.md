# RLS-Härtung Claim-Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) — die Prod-DDL läuft via `apply_migration` (MCP, nur Controller) und ist **pro DDL gated auf Aaron-Go**; Subagents können Prod nicht applizieren. Steps nutzen `- [ ]`.

**Goal:** Die 7 Claim-Read-Views hören auf, claims-RLS zu umgehen — jede Rolle sieht nur ihre Claims (Row), Vermittler keine Finanz-/Bankdaten (Column) — plus 3 sekundäre RLS-Lecks geschlossen, ohne die 122 Consumer anzufassen.

**Architecture:** Ansatz B — Views bleiben SECURITY DEFINER (Joins auf `personen`/`claim_parties` bleiben heil), bekommen aber im Body (a) einen Row-Gate `WHERE claim_sichtbar_fuer_aktuellen_user(<claim_id>)` und (b) rollenbasierte Column-Nuller `CASE WHEN rolle_sieht_X() THEN spalte ELSE null END`. Gate-/Nuller-Funktionen sind inline-fähige SQL-STABLE-SECURITY-DEFINER-Funktionen.

**Tech Stack:** PostgreSQL/Supabase (RLS, SECURITY DEFINER views, `apply_migration`), Node check-script (CI-Gate wie `check:rls-grants`).

## Global Constraints

- Prod-DDL **ausschließlich** via `mcp__plugin_supabase_supabase__apply_migration`; danach `list_migrations` → File `supabase/migrations/<getrackte-version>_<name>.sql` (Name == getrackte Version, Regel 2). `execute_sql` nur READ.
- **Jede Prod-DDL gated auf explizites Aaron-Go** (DDL zeigen, Go abwarten, dann applizieren).
- Branch `kitta/rls-haertung-claim-views` (off staging); PR gegen staging; nie auf main pushen.
- Entity→User: `makler.user_id`, `werkstaetten.user_id`, `sachverstaendige.profile_id` (verifiziert).
- Server-Bypass via `auth.role()='service_role'` (NICHT `auth.uid() IS NULL` → anon-Schutz).
- Views: Output-Shape (Spaltennamen/-typen/-reihenfolge) **identisch** lassen → 0 Consumer-Rewrites. `v_claim_listing` hat `{security_invoker=false}` explizit → beim CREATE OR REPLACE definer behalten.
- Verifikation pro Rolle via `set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}'` → Sichtbarkeits-Set; Ziel **Over-Exposure=0 UND Under-Exposure=0**.

---

## Task 1: Gate- + Column-Nuller-Funktionen

**Files:**
- Migration via `apply_migration` name `rls_haertung_claim_gate_functions`; File `supabase/migrations/<version>_rls_haertung_claim_gate_functions.sql`.

**Interfaces — Produces:**
- `public.claim_sichtbar_fuer_aktuellen_user(p_claim_id uuid) returns boolean`
- `public.rolle_sieht_bankdaten() returns boolean`, `public.rolle_sieht_margen()`, `public.rolle_sieht_regulierung()`, `public.rolle_sieht_gutachtenwerte()`

- [ ] **Step 1: DDL schreiben** (genau dieser Body):

```sql
-- Row-Gate: sieht der aktuelle Aufrufer diesen Claim?
create or replace function public.claim_sichtbar_fuer_aktuellen_user(p_claim_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    auth.role() = 'service_role'
    or exists (select 1 from profiles where id = (select auth.uid()) and rolle in ('admin','dispatch'))
    or exists (
      select 1 from claims c where c.id = p_claim_id and (
            c.geschaedigter_user_id = (select auth.uid())
         or is_claim_user_party(c.id)
         or c.sv_id        in (select id from sachverstaendige where profile_id = (select auth.uid()))
         or c.makler_id    in (select id from makler        where user_id    = (select auth.uid()))
         or c.werkstatt_id in (select id from werkstaetten  where user_id    = (select auth.uid()))
         or (exists(select 1 from profiles where id=(select auth.uid()) and rolle='kundenbetreuer')
             and (c.kundenbetreuer_id = (select auth.uid()) or c.kundenbetreuer_id is null))
         or (exists(select 1 from profiles where id=(select auth.uid()) and rolle='kanzlei')
             and c.service_typ = 'komplett')
      ));
$$;

-- Column-Nuller (rollenbasiert, deny-list-robust). service_role sieht alles.
create or replace function public.rolle_sieht_bankdaten() returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role'
     or not exists (select 1 from profiles where id=(select auth.uid()) and rolle in ('sachverstaendiger','makler','werkstatt'));
$$;
create or replace function public.rolle_sieht_regulierung() returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role'
     or not exists (select 1 from profiles where id=(select auth.uid()) and rolle in ('sachverstaendiger','makler','werkstatt'));
$$;
create or replace function public.rolle_sieht_gutachtenwerte() returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role'
     or not exists (select 1 from profiles where id=(select auth.uid()) and rolle in ('makler','werkstatt'));
$$;
create or replace function public.rolle_sieht_margen() returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role'
     or exists (select 1 from profiles where id=(select auth.uid()) and rolle in ('admin','kundenbetreuer','dispatch'));
$$;

grant execute on function public.claim_sichtbar_fuer_aktuellen_user(uuid) to authenticated, anon, service_role;
grant execute on function public.rolle_sieht_bankdaten()      to authenticated, anon, service_role;
grant execute on function public.rolle_sieht_regulierung()    to authenticated, anon, service_role;
grant execute on function public.rolle_sieht_gutachtenwerte() to authenticated, anon, service_role;
grant execute on function public.rolle_sieht_margen()         to authenticated, anon, service_role;
```

- [ ] **Step 2: Aaron-Go einholen** (DDL zeigen). Erst nach Go weiter.
- [ ] **Step 3: `apply_migration({name:'rls_haertung_claim_gate_functions', query:<DDL>})`**
- [ ] **Step 4: `list_migrations`** → getrackte Version `<V>` ablesen.
- [ ] **Step 5: File committen** `supabase/migrations/<V>_rls_haertung_claim_gate_functions.sql` (Inhalt == DDL).
- [ ] **Step 6: Funktionen verifizieren** (READ via execute_sql). Für je einen Sample-User pro Rolle:

```sql
-- Beispiel SV: erwartet gate=true nur für eigene Claims, bankdaten=false, gutachtenwerte=true
set local role authenticated;
set local request.jwt.claims = '{"sub":"<SV_PROFILE_UID>","role":"authenticated"}';
select
  public.rolle_sieht_bankdaten()      as bank,     -- erwartet false
  public.rolle_sieht_margen()         as margen,   -- erwartet false
  public.rolle_sieht_gutachtenwerte() as gutachten,-- erwartet true
  public.rolle_sieht_regulierung()    as regul;    -- erwartet false
```
Erwartung: SV → false/false/true/false; makler → false/false/false/false; admin → true/true/true/true; kunde → true/false/true/true; kanzlei → true/false/true/true. **Belegen, dann commit.**

---

## Task 2: Row-Diff-Harness + BEFORE-Snapshot

**Files:** keine Migration. Doku-Snapshot in `.superpowers/sdd/rls-rowdiff-before.md` (scratch).

- [ ] **Step 1: Sample-User je Rolle ermitteln** (READ):

```sql
select rolle, id as sample_uid from (
  select rolle, id, row_number() over (partition by rolle order by id) rn from profiles
  where rolle in ('admin','dispatch','kundenbetreuer','sachverstaendiger','kanzlei','makler','werkstatt','kunde')
) x where rn=1 order by rolle;
```
Für `kunde` zusätzlich einen mit echtem Claim: `select geschaedigter_user_id from claims where geschaedigter_user_id is not null limit 1;`

- [ ] **Step 2: BEFORE messen** — pro Sample-User die sichtbaren Claim-Counts über die 7 Views (Beispiel v_claim_full):

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<UID>","role":"authenticated"}';
select count(*) from public.v_claim_full;
```
Heute erwartet: **jede Rolle = 89** (der Leak). Dokumentiere die Zahlen pro (Rolle × View) als BEFORE. Für jede Rolle die **erwartete** AFTER-Menge notieren (admin/dispatch=89; sv=#claims mit sv_id=sein; makler=#makler_id; kunde=#eigene; kanzlei=#komplett; werkstatt=#werkstatt_id; kb=#own+pool).

- [ ] **Step 3: Erwartungswerte berechnen** (READ, Ground-Truth direkt aus claims, service-role):

```sql
select 'sv' r, count(*) from claims where sv_id in (select id from sachverstaendige where profile_id='<SV_UID>')
union all select 'makler', count(*) from claims where makler_id in (select id from makler where user_id='<MAKLER_UID>')
union all select 'kanzlei', count(*) from claims where service_typ='komplett'
union all select 'kunde', count(*) from claims where geschaedigter_user_id='<KUNDE_UID>'
union all select 'kb', count(*) from claims where kundenbetreuer_id='<KB_UID>' or kundenbetreuer_id is null
union all select 'werkstatt', count(*) from claims where werkstatt_id in (select id from werkstaetten where user_id='<WST_UID>');
```
Diese Zahlen = die AFTER-Sollwerte für Task 3 Step 5.

---

## Task 3: Row-Gate + Column-Nuller in die 7 Views

**Files:** Migration `rls_haertung_claim_views_gate`; File `supabase/migrations/<V>_rls_haertung_claim_views_gate.sql`.

**Interfaces — Consumes:** die 5 Funktionen aus Task 1.

Pro View identischer Mechanismus: aktuelle Definition via `pg_get_viewdef('public.<view>'::regclass, true)` holen, dann **(a)** `WHERE`-Gate ergänzen (mit der korrekten claim-id-Spalte), **(b)** sensible Spalten in `CASE WHEN <nuller>() THEN <spalte> ELSE null END` wrappen (gleicher Spalten-Alias!), CREATE OR REPLACE. Definer/reloptions unverändert lassen.

Pro-View-Spezifika (verifiziert):

| View | claim-id-Spalte für Gate | Column-Nuller (Spalte → Funktion) |
|---|---|---|
| `v_claim_full` | `id` | `halter_geburtsdatum`→bankdaten; `regulierung_betrag`→regulierung |
| `v_faelle_mit_aktuellem_termin` | claim-id-Spalte = die `= claims.id` ist (in Step 1 bestimmen: `id` vs `claim_id`) | `iban`/`bic`/`kontoinhaber`/`halter_geburtsdatum`→bankdaten; `kanzlei_honorar`/`lead_preis_netto`/`marketing_provision`→margen; `regulierung_betrag`→regulierung; `wertminderung`/`reparaturkosten`/`nutzungsausfall`→gutachtenwerte |
| `faelle_sv_view` | `id` | — (keine sensiblen Spalten) |
| `faelle_kunde_view` | `id` | — |
| `v_claim_phase` | `claim_id` | — |
| `v_claim_listing` | `claim_id` | — (reloptions `{security_invoker=false}` behalten) |
| `v_claim_parties_safe` | `claim_id` | — (Spalten-Masking existiert; nur Gate) |

- [ ] **Step 1: claim-id-Spalte je View bestätigen** (READ): `pg_get_viewdef` lesen; für `v_faelle_mit_aktuellem_termin` prüfen welche Spalte `claims.id` führt (die andere ist die Bridge/`fall_id`). Gate-Spalte = die mit `claims.id`.
- [ ] **Step 2: DDL bauen** — pro View CREATE OR REPLACE mit Gate + (für die 2 View) Nullern. Beispiel v_claim_parties_safe (gate-only):

```sql
create or replace view public.v_claim_parties_safe as
  <aktuelle-defn-unveraendert>
  where claim_sichtbar_fuer_aktuellen_user(claim_id);  -- NEU
```
Beispiel v_claim_full (gate + 2 Nuller): die `SELECT`-Liste behält alle Spalten, aber `halter_geburtsdatum` → `case when rolle_sieht_bankdaten() then halter_geburtsdatum else null end as halter_geburtsdatum` und `regulierung_betrag` → `case when rolle_sieht_regulierung() then regulierung_betrag else null end as regulierung_betrag`; am Ende `where claim_sichtbar_fuer_aktuellen_user(id)`.

- [ ] **Step 3: Aaron-Go** (alle 7 CREATE OR REPLACE zeigen). Erst nach Go.
- [ ] **Step 4: `apply_migration`** → `list_migrations` → File version-matched committen.
- [ ] **Step 5: AFTER messen + Asserten** (READ, pro Rolle, wie Task 2):
  - **Over-Exposure=0:** keine externe Rolle (sv/makler/werkstatt/kunde/kanzlei) sieht mehr als ihre Soll-Claims (Task 2 Step 3); insb. sv/makler/werkstatt/kunde < 89.
  - **Under-Exposure=0:** jede Rolle sieht **genau** ihre Soll-Menge (== Ground-Truth aus Task 2 Step 3); admin/dispatch=89.
  - **Column-Check:** als sv `select count(*) filter (where iban is not null)` auf v_faelle_mit_aktuellem_termin = 0; als kunde mit eigenem Claim = sieht eigene iban.
  - **Service-role-Check:** `set local role service_role` → v_claim_full count = 89 (Cron/Admin-Client unberührt).
- [ ] **Step 6: EXPLAIN-Perf-Gate** (READ): `explain (analyze,buffers) select * from v_claim_full where id='<claim>';` + List-Query — keine Seq-Scan-Regression ggü. BEFORE; Gate-Funktion inlined. Bei Regression: Gate-Logik als korrelierte Subqueries inlinen statt Funktionswrapper.
- [ ] **Step 7: Smoke** — bestehende Portal-Smokes gegen staging (SV/Kanzlei/Makler/Kunde sehen ihre Fälle). Commit.

---

## Task 4: fall_dokumente — SV/Kanzlei respektieren `sichtbar_fuer`

**Files:** Migration `rls_fall_dokumente_sichtbar_fuer`; File entsprechend.

- [ ] **Step 1: DDL** (SV-ALL-Policy splitten + Kanzlei-SELECT verschärfen):

```sql
-- Kanzlei: SELECT zusaetzlich auf sichtbar_fuer gaten
drop policy "Kanzlei liest fall_dokumente" on public.fall_dokumente;
create policy "Kanzlei liest fall_dokumente" on public.fall_dokumente for select to public
using (exists (select 1 from faelle_claim_bridge b join claims c on c.id=b.claim_id
               join profiles on profiles.id=(select auth.uid())
        where b.fall_id=fall_dokumente.fall_id and profiles.rolle='kanzlei' and c.service_typ='komplett')
       and sichtbar_fuer @> array['kanzlei']);

-- SV: ALL aufsplitten -> SELECT (sichtbar_fuer-gated) + write (ungated, eigene Faelle)
drop policy "SV eigene Fall-Dokumente" on public.fall_dokumente;
create policy "SV liest sichtbare Fall-Dokumente" on public.fall_dokumente for select to public
using (fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id=b.claim_id
                   where c.sv_id in (select id from sachverstaendige where profile_id=(select auth.uid())))
       and sichtbar_fuer @> array['sachverstaendiger']);
create policy "SV schreibt eigene Fall-Dokumente ins" on public.fall_dokumente for insert to public
with check (fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id=b.claim_id
                        where c.sv_id in (select id from sachverstaendige where profile_id=(select auth.uid()))));
create policy "SV aendert eigene Fall-Dokumente upd" on public.fall_dokumente for update to public
using (fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id=b.claim_id
                   where c.sv_id in (select id from sachverstaendige where profile_id=(select auth.uid()))));
create policy "SV loescht eigene Fall-Dokumente del" on public.fall_dokumente for delete to public
using (fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id=b.claim_id
                   where c.sv_id in (select id from sachverstaendige where profile_id=(select auth.uid()))));
```

- [ ] **Step 2: Aaron-Go → apply_migration → list_migrations → File committen.**
- [ ] **Step 3: Verifizieren** (READ): als SV `select count(*) from fall_dokumente where dokument_typ in ('sa_vollmacht','ki_kalkulation','abrechnung_intern')` auf eigene Fälle = 0 (interne unsichtbar); SV sieht weiter `sichtbar_fuer @> ['sachverstaendiger']`-Docs; SV-INSERT auf eigenen Fall funktioniert (Test-Insert+Rollback). Commit.

---

## Task 5: KB sieht eigene kb_beratung-Termine

**Files:** Migration `rls_gutachter_termine_kb_beratung`; File entsprechend.

- [ ] **Step 1: DDL** (neue SELECT-Policy für claim_id-lose KB-Beratungstermine):

```sql
create policy "KB liest eigene kb_beratung Termine" on public.gutachter_termine for select to authenticated
using (
  typ = 'kb_beratung'
  and (kb_id = (select auth.uid())
       or (assignee_typ = 'kundenbetreuer' and assignee_id = (select auth.uid())))
);
```

- [ ] **Step 2: Aaron-Go → apply_migration → list_migrations → File committen.**
- [ ] **Step 3: Verifizieren** (READ): als KB-Sample-User `select count(*) from gutachter_termine where typ='kb_beratung' and kb_id='<KB_UID>'` > 0 (sofern Daten); kein fremder KB sieht sie. Commit.

---

## Task 6: anon-Leads token-scopen (RPC)

**Files:** Migration `rls_anon_lead_token_rpc`; `src/app/flow/[token]/*` (Lead-Read → RPC). ⚠️ Flow-Domäne → vor dem Bauen Koordinations-Marker prüfen.

- [ ] **Step 1: RPC + Policy-DDL:**

```sql
create or replace function public.get_lead_for_flow(p_token text)
returns setof public.leads language sql stable security definer set search_path=public as $$
  select * from public.leads where flow_token = p_token and status = 'flow-gesendet';
$$;
grant execute on function public.get_lead_for_flow(text) to anon, authenticated;
drop policy "Flow anon select leads" on public.leads;
```
(Vorab in Step 0 verifizieren: exakter Spaltenname des Flow-Tokens in `leads` — `flow_token`? via `information_schema.columns`. Die RPC-where-Klausel danach anpassen.)

- [ ] **Step 2: Flow-Code** — die `/flow/[token]`-Lead-Lese-Stelle von `from('leads').eq(...)` auf `rpc('get_lead_for_flow',{p_token:token})` umstellen (Array-Normalisierung: RPC liefert setof → `[0]`).
- [ ] **Step 3: Aaron-Go → apply_migration → list_migrations → File committen.**
- [ ] **Step 4: Verifizieren** (READ): `set local role anon; select count(*) from leads where status='flow-gesendet'` → 0 (kein Direct-Read mehr); `select count(*) from get_lead_for_flow('<gueltiger-token>')` = 1; `get_lead_for_flow('falsch')` = 0. Flow-Smoke (Magic-Link lädt). Commit.

---

## Task 7: CI-Gate `check:claim-view-rls`

**Files:** Create `scripts/check-claim-view-rls.mjs`; Modify `package.json`, `.github/workflows/ci.yml`.

- [ ] **Step 1: Script** (Muster `scripts/check-rls-function-grants.mjs`): service-role-Client, prüft per `set_config('request.jwt.claims',...)`/RPC-Probe für je einen Sample-User pro externer Rolle, dass `v_claim_full`-Count < total UND == Ground-Truth (over+under-exposure=0). PR-Gate (nur wenn `supabase/**` oder die Views/Funktionen berührt). Bei Drift exit 1.
- [ ] **Step 2: `package.json`** `"check:claim-view-rls": "node --env-file=.env.local scripts/check-claim-view-rls.mjs"`.
- [ ] **Step 3: `ci.yml`** Step „Claim-View-RLS" neben „RLS-Function-Grants" (service-role-ENV).
- [ ] **Step 4:** `node --check scripts/check-claim-view-rls.mjs`; Logik gegen Live-DB via MCP verifizieren (kein Key lokal). Commit.

---

## Reihenfolge / Abhängigkeiten
Task 1 → Task 2 (BEFORE) → Task 3 (braucht 1+2). Tasks 4/5/6 unabhängig (parallel möglich). Task 7 zuletzt. **Jede DDL einzeln gated.**

## Rollback
Pro Migration: alte View-/Policy-Definitionen (aus git bzw. `pg_get_viewdef` BEFORE-Snapshot) per CREATE OR REPLACE / DROP+CREATE zurück; Funktionen `drop function`. Views referenzieren die Funktionen → bei Funktions-Rollback zuerst Views zurück.

## Im Plan offen zu verifizieren (Exploration in den Task-Steps)
- `v_faelle_mit_aktuellem_termin`: welche Spalte == `claims.id` (Gate-Arg).
- `leads`-Flow-Token-Spaltenname (Task 6 Step 1).
- KB-Termine: ist `kb_id` oder `assignee_id` für `kb_beratung` zuverlässig gesetzt (beide in der Policy abgedeckt).
- `leadbearbeiter`: braucht die Rolle Claim-View-Zugriff? (im Gate aktuell NICHT → Harness Under-Exposure-Check; falls Portal bricht, Rolle ergänzen).
