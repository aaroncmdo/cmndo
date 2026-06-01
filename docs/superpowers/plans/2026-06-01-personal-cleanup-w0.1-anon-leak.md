# W0.1 — anon-Leak `sachverstaendige` schließen (AAR-944) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anonyme Nutzer können über die öffentliche Gutachter-Karte keine sensiblen Spalten von `sachverstaendige` mehr lesen (gcal-Token, stripe_customer_id, ust_id, steuernummer), während die Karte unverändert funktioniert.

**Architecture:** Schmale `security_definer`-View `v_sv_map_public` exponiert nur die Karten-Spalten (WHERE map-ready), Grant an `anon`+`authenticated`. Der einzige anon-Reader (`ladeAktiveSVs()`) wird auf die View umgebogen. **Erst nach Deploy** des Repoints wird die breite anon-Table-Policy gedroppt. Das lebende Legacy-`gcal_*`-Token wird sofort genullt.

**Tech Stack:** Postgres 17 (Supabase), Next.js 16 (Server Actions / SSR), `@supabase/supabase-js`, Supabase-Plugin (`apply_migration`), `scripts/probe-anon-sv-leak.mjs` (Regressions-Probe), Playwright/Browser-Smoke.

**Reihenfolge (hart):** Task 1 (View+gcal-null, additiv) → Task 2 (Code-Repoint **+ Deploy**) → Task 3 (Policy-Drop, `apply_migration` **erst nach** Task-2-Deploy) → Re-Probe + Smoke.

**Branch:** `kitta/personal-cleanup`. Pro Task ein PR gegen `staging`. DDL **nur** via `apply_migration` (Regel 2). `execute_sql` nur READ.

---

## Pre-Flight (vor Task 1, einmalig)

- [ ] **P1: Live-Schema gegen Annahmen prüfen** (Shared-Prod-DB, Snapshots stale).

`execute_sql` (READ):
```sql
-- Policy existiert noch unter diesem Namen?
select policyname, cmd, roles::text from pg_policies
where schemaname='public' and tablename='sachverstaendige' and roles::text like '%anon%';
-- exakte Spalten, die ladeAktiveSVs braucht, existieren?
select column_name from information_schema.columns
where table_schema='public' and table_name='sachverstaendige'
and column_name in ('id','paket','profile_id','firmenname','standort_lat','standort_lng','standort_adresse','spezifikationen','isochrone_polygon','verifiziert','ist_aktiv','geloescht_am','gcal_access_token','gcal_refresh_token','gcal_token_expiry');
```
Expected: Policy `sachverstaendige_anon_select_map_ready` für `{anon}` vorhanden; alle 16 Spalten gelistet.

- [ ] **P2: Baseline-Probe (zeigt den Leak — unser „failing test")**

Run (PowerShell):
```
$env:SUPABASE_URL="https://paizkjajbuxxksdoycev.supabase.co"; $env:SUPABASE_ANON_KEY="<publishable-key>"; node scripts/probe-anon-sv-leak.mjs
```
Expected: `[1] anon konnte 6 ... Zeile(n)` mit `gcal_refresh_token: 1, stripe_customer_id: 3, ust_id: 2` (Leak offen). Das ist der Ausgangszustand, den Task 3 auf 0 bringt.

---

## File Structure

- **Create:** `supabase/migrations/<V1>_create_v_sv_map_public_and_null_legacy_gcal.sql` — View + Grant + gcal-Null (Task 1)
- **Modify:** `src/lib/actions/gutachter-finder-actions.ts` (`ladeAktiveSVs`, ~Zeile 110) — `.from('sachverstaendige')` → `.from('v_sv_map_public')` (Task 2)
- **Create:** `supabase/migrations/<V2>_drop_sachverstaendige_anon_select_policy.sql` — Policy-Drop (Task 3)
- **Unverändert (NICHT anfassen):** `src/lib/dispatch/karte/get-active-svs.ts`, `src/app/api/kfzgutachter-lp/gutachter-verfuegbar/route.ts` (admin/service-Reader, RLS-bypass, kein anon)

---

## Task 1 — PR (a): View `v_sv_map_public` + Legacy-`gcal_*` nullen  [additiv, safe]

**Files:**
- Create: `supabase/migrations/<V1>_create_v_sv_map_public_and_null_legacy_gcal.sql`

- [ ] **Step 1: DDL via Supabase-Plugin anwenden**

`apply_migration({ name: "create_v_sv_map_public_and_null_legacy_gcal", query: <DDL> })` mit:
```sql
-- Safe-Projektion der oeffentlichen SV-Karte. SECURITY DEFINER (default view):
-- laeuft als View-Owner und umgeht damit bewusst die Table-RLS, sodass anon
-- nach dem Policy-Drop (W0.1 Task 3) NUR diese unkritischen Spalten + nur
-- map-ready Zeilen sieht. KEINE Credential-Spalten (gcal/stripe/ust/steuernummer).
create or replace view public.v_sv_map_public as
select
  id, profile_id, paket, firmenname,
  standort_lat, standort_lng, standort_adresse,
  spezifikationen, isochrone_polygon
from public.sachverstaendige
where verifiziert = true
  and ist_aktiv = true
  and geloescht_am is null
  and standort_lat is not null
  and standort_lng is not null
  and isochrone_polygon is not null;

comment on view public.v_sv_map_public is
  'Oeffentliche SV-Karte (anon). Bewusst SECURITY DEFINER + nur unkritische Spalten. Ersetzt die anon-Table-Policy auf sachverstaendige (W0.1 / AAR-944).';

grant select on public.v_sv_map_public to anon, authenticated;

-- Legacy-Token nullen: profiles.google_* ist kanonisch; sachverstaendige.gcal_*_token
-- werden nicht mehr gelesen (nur gcal_connected-Flag) -> Credential-Leak sofort zu.
update public.sachverstaendige
set gcal_access_token = null, gcal_refresh_token = null, gcal_token_expiry = null
where gcal_access_token is not null or gcal_refresh_token is not null or gcal_token_expiry is not null;
```

- [ ] **Step 2: Getrackte Version ablesen** — `list_migrations` → Version `<V1>` notieren (Plugin setzt eigenen Timestamp).

- [ ] **Step 3: Migration-File committen — Name == `<V1>`**

Datei `supabase/migrations/<V1>_create_v_sv_map_public_and_null_legacy_gcal.sql` mit EXAKT dem DDL aus Step 1.

- [ ] **Step 4: Verifizieren (READ)** — `execute_sql`:
```sql
select count(*) as view_rows from public.v_sv_map_public;                       -- erwartet: 6
select count(*) as leftover_tokens from public.sachverstaendige
  where gcal_access_token is not null or gcal_refresh_token is not null;        -- erwartet: 0
select has_table_privilege('anon','public.v_sv_map_public','select') as anon_can_read; -- erwartet: true
```

- [ ] **Step 5: gcal-Null Zwischen-Probe** — Run `node scripts/probe-anon-sv-leak.mjs` (wie P2).
Expected: `gcal_refresh_token: 0, gcal_access_token: 0` (Token weg). `stripe_customer_id`/`ust_id` noch >0 (Policy noch da — wird in Task 3 geschlossen).

- [ ] **Step 6: Commit + PR**
```bash
git -C <worktree> add supabase/migrations/<V1>_create_v_sv_map_public_and_null_legacy_gcal.sql
git -C <worktree> commit  # Message: "feat(security): v_sv_map_public View + Legacy gcal nullen (W0.1a/AAR-944)" + Audit-Block
git -C <worktree> push -u origin HEAD:kitta/personal-cleanup
gh pr create --base staging --title "W0.1a — v_sv_map_public + gcal-null (AAR-944)" --body "<...>"
```

---

## Task 2 — PR (b): `ladeAktiveSVs()` auf die View umbiegen + Deploy

**Files:**
- Modify: `src/lib/actions/gutachter-finder-actions.ts` (`ladeAktiveSVs`, die `.from('sachverstaendige')`-Query ~Z.108–115)

- [ ] **Step 1: Repoint** — exakt eine Zeile ändern: `.from('sachverstaendige')` → `.from('v_sv_map_public')`. Die `.select(...)`-Liste bleibt identisch (alle 9 Spalten existieren in der View). Die `.eq('ist_aktiv', true)` / `.not('isochrone_polygon', ...)` / `.not('standort_lat', ...)`-Filter bleiben (redundant zur View-WHERE, aber harmlos). Kommentar darüber:
```ts
// W0.1/AAR-944: liest aus der SECURITY-DEFINER-View v_sv_map_public (nur Karten-Spalten),
// nicht mehr direkt aus sachverstaendige -> kein anon-Zugriff auf gcal/stripe/ust.
```

- [ ] **Step 2: Build-Gate** — Run: `npm run build` (Routen/Server-Actions betroffen → voller Build, nicht nur tsc). Expected: grün.

- [ ] **Step 3: Lokaler/Staging-Funktions-Check** — sicherstellen, dass `ladeAktiveSVs()` weiter 6 Objekte mit `id/standort_lat/standort_lng/isochrone_polygon/paket/vorname_initiale/stadt/spezifikationen_top3` liefert (View liefert die Roh-Spalten; `vorname_initiale`/`stadt`/Bewertungen kommen wie bisher aus den Admin-Joins auf `profiles`/`google_bewertungen_cache`, unverändert).

- [ ] **Step 4: Commit + PR**
```bash
git -C <worktree> add src/lib/actions/gutachter-finder-actions.ts
git -C <worktree> commit  # "refactor(security): ladeAktiveSVs liest v_sv_map_public statt sachverstaendige (W0.1b/AAR-944)" + Audit-Block
git -C <worktree> push -u origin HEAD:kitta/personal-cleanup
gh pr create --base staging --title "W0.1b — Repoint ladeAktiveSVs auf v_sv_map_public (AAR-944)" --body "<...>"
```

- [ ] **Step 5: MERGE + DEPLOY abwarten** — Dieser Repoint muss **live** sein (staging→main→VPS-Deploy), BEVOR Task 3 die Policy droppt. **Gate:** erst weiter, wenn die deployte Karte aus der View liest.

- [ ] **Step 6: Smoke nach Deploy** — öffentliche Karte `app.staging.claimondo.de/gutachter-finden` (bzw. Prod) laden, **Screenshot im selben Turn auswerten**: Marker + Popups (Initiale, Stadt, Specs, Rating) erscheinen wie vorher. Expected: Karte voll, keine leeren Marker.

---

## Task 3 — PR (c): anon-Table-Policy droppen + Re-Probe + Smoke

> **Gate:** NUR starten, wenn Task 2 deployt UND Smoke grün ist.

**Files:**
- Create: `supabase/migrations/<V2>_drop_sachverstaendige_anon_select_policy.sql`

- [ ] **Step 1: Live nochmal prüfen, dass die View deployt konsumiert wird** — kurzer READ, dass `v_sv_map_public` existiert + 6 Zeilen (s. Task 1 Step 4). Sicherheitsnetz vor dem Drop.

- [ ] **Step 2: DDL via Plugin** — `apply_migration({ name: "drop_sachverstaendige_anon_select_policy", query: <DDL> })`:
```sql
drop policy if exists sachverstaendige_anon_select_map_ready on public.sachverstaendige;
-- Hinweis: ein evtl. verbliebenes table-level GRANT auf anon liefert ohne Policy 0 Zeilen
-- (RLS deny-by-default). Optional zusaetzlich absichern:
revoke select on public.sachverstaendige from anon;
```

- [ ] **Step 3: Version ablesen + File committen** — `list_migrations` → `<V2>`; Datei `supabase/migrations/<V2>_drop_sachverstaendige_anon_select_policy.sql` == DDL.

- [ ] **Step 4: Re-Probe (unser „passing test")** — Run `node scripts/probe-anon-sv-leak.mjs`.
Expected: `[1] anon konnte 0 ... Zeile(n)` **ODER** Fehler `42501`/permission denied auf `sachverstaendige`; alle sensiblen Counts = 0. `[2] profiles als anon: 0`. → **Leak geschlossen.**

- [ ] **Step 5: Public-Map-Smoke (Regression)** — `/gutachter-finden` erneut laden, Screenshot auswerten: Karte weiter voll (liest jetzt View, Policy-Drop hat keinen Effekt auf den View-Pfad). API-Pfade `GET /api/v1/sv-in-naehe?plz=50670&radius=30` + `/api/v1/karte/50670.png` 200 + Marker. Expected: alles grün.

- [ ] **Step 6: Supabase-Advisor** — `get_advisors(type:"security")`. Den erwarteten „security_definer view"-Hinweis zu `v_sv_map_public` als bewusst-akzeptiert dokumentieren (Kommentar liegt am View). Keine NEUEN ungewollten Findings.

- [ ] **Step 7: Commit + PR + Linear**
```bash
git -C <worktree> add supabase/migrations/<V2>_drop_sachverstaendige_anon_select_policy.sql
git -C <worktree> commit  # "feat(security): anon-Policy auf sachverstaendige droppen — Leak zu (W0.1c/AAR-944)" + Audit-Block
git -C <worktree> push -u origin HEAD:kitta/personal-cleanup
gh pr create --base staging --title "W0.1c — anon-Policy drop + Leak verifiziert 0 (AAR-944)" --body "<Probe-Output 0 Treffer>"
```
- [ ] AAR-944 auf Done; Parallel-Reminder an Aaron: **Google-Grant des betroffenen SV (id `67fba866-…`) widerrufen/rotieren** (Token war exponiert → kompromittiert).

---

## Akzeptanzkriterien (Definition of Done)

1. `scripts/probe-anon-sv-leak.mjs`: 0 sensible Treffer (gcal/stripe/ust = 0; anon-Tabellen-Read blockiert).
2. Öffentliche Karte `/gutachter-finden` + `/api/v1/sv-in-naehe` + `/api/v1/karte/[plz].png` Smoke-grün (Marker/Popups vollständig).
3. Admin/Dispatch/SV-eigene SV-Reads unverändert funktionsfähig (nicht repointet).
4. Drei Migrationen getrackt, File-Namen == getrackte Versionen.
5. Legacy `gcal_*`-Token in `sachverstaendige` = NULL; Aaron hat Google-Grant rotiert.

## Self-Review

- **Spec-Coverage:** deckt §4 W0.1 (a/b/c + gcal-null + Re-Probe + Smoke) vollständig ab. ✅
- **Korrektur ggü. Spec:** View ist `security_definer` (nicht invoker) — begründet (anon-Lesbarkeit nach Policy-Drop). In Umbrella-Spec nachziehen.
- **Platzhalter:** keine — SQL, Code-Change (1 Zeile), Commands konkret. `<V1>/<V2>` sind absichtlich erst zur Apply-Zeit bekannt (Plugin vergibt Timestamp) — Schritt zum Ablesen ist enthalten. `<publishable-key>` nicht im Repo (Env).
- **Typ-/Namens-Konsistenz:** View-Spalten == `ladeAktiveSVs`-Select-Liste (9 Spalten, geprüft gegen Code).
- **Reihenfolge:** Task-3-`apply_migration` explizit hinter Task-2-Deploy-Gate.
