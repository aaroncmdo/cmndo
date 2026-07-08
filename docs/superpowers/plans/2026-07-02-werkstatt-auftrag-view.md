# Werkstatt-Auftrag-View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine kanonische, RLS-gegatete, DB-getriebene SSoT-View `v_werkstatt_auftrag`, die einer Werkstatt alle Entitäten ihres vermittelten Auftrags zeigt (Claim/Fahrzeug/Besichtigung/Gutachter/Kunde-Name/Werkstatt/Ansprechpartner/Provision), plus der Werkstatt-Ansprechpartner-Name.

**Architecture:** Rein additiv. Ein SECURITY-DEFINER-Helfer `is_werkstatt_for_claim` (analog `is_sv_for_claim`) kapselt die Werkstatt-Ownership (beide Richtungen). Die View joint die Entitäten und filtert per `is_staff() OR is_werkstatt_for_claim(id)`. Der Helfer wird im `check-claim-view-rls`-Ratchet registriert → automatische Nobody-/anon-Leak-Prüfung. Ein neuer Text-Column `werkstaetten.ansprechpartner_name` + Erfassung im Admin-Werkstatt-Formular.

**Tech Stack:** PostgreSQL (Supabase) Views/Functions, Next.js 15 Server-Actions (TypeScript), vitest.

## Global Constraints

- **DDL NUR über das Supabase-Plugin** (`apply_migration`) → `list_migrations` → File committen als `supabase/migrations/<getrackte-Version>_<name>.sql` (Dateiname == Version, sonst Twin-Drift). `execute_sql` NUR für READ/Smoke. NIE CLI/raw-DDL. (AGENTS.md Regel 2 + BROADCAST-supabase-nur-plugin.)
- **Additiv** — KEINE Änderung an 1069c2a2s Vermittlungs-Modell/Files (`claims`-Spalten nur LESEN), KEINE Änderung an der RPC `get_werkstatt_reparatur_auftraege`, KEINE Änderung an der Werkstatt-Inbox (`kitta/werkstatt-freigabe-followups`-Domäne).
- **PII minimiert:** die View exponiert vom Kunden NUR den Namen, vom Gutachter NUR `firmenname` — KEIN Telefon/Email/Adresse. Koordination läuft über Claimondo.
- **View-Härtung** (aus dem Claim-View-Audit): View läuft als Owner (postgres, kein `security_invoker`), Gate als WHERE-Klausel, `GRANT SELECT TO authenticated`, `REVOKE FROM anon`.
- **Nie auf main** (Regel 1), PR gegen `staging`. **7-Punkte-Audit** im Commit-Body. **Kein unbegleiteter Stash** (Regel 3).
- **Frontend-Umlaute** (Task 5 UI-Strings): echte `ä/ö/ü/ß`.
- **Prod-Smoke als echte Rolle** (`set local role authenticated` + JWT, nie service-role-„0 Zeilen") — BROADCAST-alle-sessions-smoke-bis-1plus.

## File Structure

- `supabase/migrations/<V1>_is_werkstatt_for_claim_helper.sql` — NEU: der Ownership-Helfer.
- `supabase/migrations/<V2>_register_is_werkstatt_for_claim_in_audit.sql` — NEU: `audit_ungated_definer_views` um den Helfer als bekanntes Gate erweitern.
- `supabase/migrations/<V3>_werkstaetten_ansprechpartner_name.sql` — NEU: der Text-Column.
- `supabase/migrations/<V4>_v_werkstatt_auftrag_view.sql` — NEU: die kanonische View.
- `src/app/admin/werkstaetten/actions.ts` — MODIFY: `ansprechpartner_name` im Create/Update-Payload.
- `src/app/admin/werkstaetten/WerkstaettenClient.tsx` — MODIFY: Formular-Feld Ansprechpartner.
- `src/app/admin/werkstaetten/__tests__/actions.test.ts` — MODIFY: Test für `ansprechpartner_name`.

---

### Task 1: Helfer `is_werkstatt_for_claim` + Registrierung im check-claim-view-rls-Audit

**Files:**
- Create: `supabase/migrations/<V1>_is_werkstatt_for_claim_helper.sql`
- Create: `supabase/migrations/<V2>_register_is_werkstatt_for_claim_in_audit.sql`

**Interfaces:**
- Produces: `public.is_werkstatt_for_claim(p_claim_id uuid) → boolean` (SECURITY DEFINER; true wenn der Claim via `werkstatt_id` ODER `reparatur_werkstatt_id` einer Werkstatt des `auth.uid()`-Users gehört).

- [ ] **Step 1: DDL schreiben (Helfer)**

```sql
CREATE OR REPLACE FUNCTION public.is_werkstatt_for_claim(p_claim_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM claims c
    WHERE c.id = p_claim_id
      AND ( c.werkstatt_id           IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid()))
         OR c.reparatur_werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid())) )
  );
$function$;
REVOKE ALL ON FUNCTION public.is_werkstatt_for_claim(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_werkstatt_for_claim(uuid) TO authenticated, service_role;
```

- [ ] **Step 2: Anwenden via Plugin** — `apply_migration({ name: 'is_werkstatt_for_claim_helper', query: <obiges DDL> })`.
- [ ] **Step 3: Version ablesen** — `execute_sql: SELECT version FROM supabase_migrations.schema_migrations WHERE name='is_werkstatt_for_claim_helper';` → `<V1>`.
- [ ] **Step 4: File committen** als `supabase/migrations/<V1>_is_werkstatt_for_claim_helper.sql` (exakt das DDL aus Step 1).
- [ ] **Step 5: DDL schreiben (Audit-Registrierung)** — `audit_ungated_definer_views` erkennt bisher nur claim_sichtbar/can_access_claim/is_claim_user_party/is_sv_for_claim/v_claim_base. Der neue Helfer wird ergänzt, sonst flaggt der Ratchet die View fälschlich als „ungated":

```sql
CREATE OR REPLACE FUNCTION public.audit_ungated_definer_views()
 RETURNS TABLE(view_name text, app_grants text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.relname::text AS view_name,
    (SELECT string_agg(DISTINCT grantee, ',' ORDER BY grantee) FROM information_schema.role_table_grants g
       WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.privilege_type = 'SELECT'
         AND grantee IN ('anon','authenticated')) AS app_grants
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND COALESCE(c.reloptions::text ILIKE '%security_invoker=true%', false) = false
    AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
         WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.privilege_type = 'SELECT'
           AND grantee IN ('anon','authenticated'))
    AND pg_get_viewdef(c.oid) NOT ILIKE '%claim_sichtbar%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%can_access_claim%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%is_claim_user_party%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%is_sv_for_claim%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%is_werkstatt_for_claim%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%v_claim_base%'
  ORDER BY c.relname;
$function$;
REVOKE ALL ON FUNCTION public.audit_ungated_definer_views() FROM public;
GRANT EXECUTE ON FUNCTION public.audit_ungated_definer_views() TO service_role;
```
> **Koordination:** `audit_ungated_definer_views` stammt aus PR #3361 (Branch `kitta/rls-safety-net`, noch nicht auf staging gemergt) — die Fn ist aber schon in prod (via Plugin appliziert). Diese Migration enthält den VOLLEN Fn-Body (standalone-sicher: CREATE OR REPLACE erstellt sie notfalls frisch); beim Merge komponiert sie last-wins mit #3361. Full-Body → merge-order-unabhängig.

- [ ] **Step 6: Anwenden** — `apply_migration({ name: 'register_is_werkstatt_for_claim_in_audit', query: <obiges DDL> })`.
- [ ] **Step 7: Version ablesen + File committen** als `supabase/migrations/<V2>_register_is_werkstatt_for_claim_in_audit.sql`.
- [ ] **Step 8: Verifizieren (der „Test")** — Test-Claim mit einer der 7 Werkstätten finden + Ownership prüfen:

```sql
-- eine Werkstatt mit user_id + einem verlinkten Claim
WITH wc AS (
  SELECT w.user_id, c.id AS claim_id
  FROM claims c JOIN werkstaetten w ON w.id = COALESCE(c.reparatur_werkstatt_id, c.werkstatt_id)
  WHERE w.user_id IS NOT NULL AND (c.werkstatt_id IS NOT NULL OR c.reparatur_werkstatt_id IS NOT NULL) LIMIT 1
)
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM wc), 'role','authenticated')::text, true);
SELECT
  is_werkstatt_for_claim((SELECT claim_id FROM wc)) AS eigener_soll_true,
  is_werkstatt_for_claim('00000000-0000-0000-0000-000000000000') AS fremder_soll_false;
```
Expected: `eigener_soll_true=true`, `fremder_soll_false=false`.

---

### Task 2: Column `werkstaetten.ansprechpartner_name`

**Files:**
- Create: `supabase/migrations/<V3>_werkstaetten_ansprechpartner_name.sql`

**Interfaces:**
- Produces: `werkstaetten.ansprechpartner_name text` (nullable).

- [ ] **Step 1: DDL** — `ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS ansprechpartner_name text;` (mit Kommentar: „Ansprechpartner/GF-Name — direktes Feld, da ansprechpartner_person_id (0/7, keine persons-Tabelle) tot ist").
- [ ] **Step 2: Anwenden** — `apply_migration({ name: 'werkstaetten_ansprechpartner_name', query: <DDL> })`.
- [ ] **Step 3: Version ablesen + File committen** als `supabase/migrations/<V3>_werkstaetten_ansprechpartner_name.sql`.
- [ ] **Step 4: Verifizieren** — `execute_sql: SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name='werkstaetten' AND column_name='ansprechpartner_name';` Expected: 1 Zeile, `YES`, `text`.

---

### Task 3: View `v_werkstatt_auftrag`

**Files:**
- Create: `supabase/migrations/<V4>_v_werkstatt_auftrag_view.sql`

**Interfaces:**
- Consumes: `is_werkstatt_for_claim` (Task 1), `werkstaetten.ansprechpartner_name` (Task 2), `is_staff()` (existiert).
- Produces: View `public.v_werkstatt_auftrag` mit Spalten: `claim_id, vermittlung_status, quelle, zugewiesen_am, richtung, claim_nummer, schadenart, reparaturwunsch, claim_status, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, fin, besichtigung_start, besichtigung_ort, besichtigung_status, gutachter_firmenname, kunde_name, werkstatt_id, werkstatt_name, werkstatt_ansprechpartner, provision_betrag_netto, provision_status`.

- [ ] **Step 1: DDL** (gegen Prod-Schema gegroundet: typ='sv_begutachtung', rolle='geschaedigter', alle Spalten verifiziert):

```sql
CREATE OR REPLACE VIEW public.v_werkstatt_auftrag AS
SELECT
  c.id AS claim_id,
  c.reparatur_vermittlung_status AS vermittlung_status,
  c.reparatur_werkstatt_quelle   AS quelle,
  c.reparatur_werkstatt_zugewiesen_am AS zugewiesen_am,
  CASE WHEN c.reparatur_werkstatt_id IS NOT NULL THEN 'vermittelt' ELSE 'inbound' END AS richtung,
  c.claim_nummer, c.schadenart, c.reparaturwunsch, c.status AS claim_status,
  v.hersteller AS fahrzeug_hersteller,
  NULLIF(concat_ws(' ', v.modell_haupttyp, v.modell_untertyp), '') AS fahrzeug_modell,
  v.kennzeichen_aktuell AS kennzeichen, v.fin,
  gt.start_zeit AS besichtigung_start, gt.besichtigungsort_adresse AS besichtigung_ort, gt.status AS besichtigung_status,
  sv.firmenname AS gutachter_firmenname,
  COALESCE(NULLIF(concat_ws(' ', p.vorname, p.nachname), ''), NULLIF(concat_ws(' ', l.vorname, l.nachname), '')) AS kunde_name,
  w.id AS werkstatt_id, w.name AS werkstatt_name, w.ansprechpartner_name AS werkstatt_ansprechpartner,
  wp.betrag_netto_eur AS provision_betrag_netto, wp.status AS provision_status
FROM public.claims c
LEFT JOIN public.claim_vehicle_involvements cvi ON cvi.claim_id = c.id AND cvi.rolle = 'geschaedigter'
LEFT JOIN public.vehicles v ON v.id = cvi.vehicle_id
LEFT JOIN LATERAL (
  SELECT t.start_zeit, t.besichtigungsort_adresse, t.status
  FROM public.gutachter_termine t
  WHERE t.claim_id = c.id AND t.typ = 'sv_begutachtung'
  ORDER BY t.start_zeit DESC NULLS LAST LIMIT 1
) gt ON true
LEFT JOIN public.sachverstaendige sv ON sv.id = c.sv_id
LEFT JOIN public.profiles p ON p.id = c.geschaedigter_user_id
LEFT JOIN public.leads l ON l.id = c.lead_id
LEFT JOIN public.werkstaetten w ON w.id = COALESCE(c.reparatur_werkstatt_id, c.werkstatt_id)
LEFT JOIN public.werkstatt_provisionen wp ON wp.claim_id = c.id AND wp.werkstatt_id = w.id
WHERE (c.werkstatt_id IS NOT NULL OR c.reparatur_werkstatt_id IS NOT NULL)
  AND (public.is_staff() OR public.is_werkstatt_for_claim(c.id));

REVOKE ALL ON public.v_werkstatt_auftrag FROM anon;
GRANT SELECT ON public.v_werkstatt_auftrag TO authenticated;
```
> **Härtung:** KEIN `security_invoker` setzen — die View läuft als Owner (postgres) und bypasst Tabellen-RLS; der Schutz ist die WHERE-Gate-Klausel (`is_staff() OR is_werkstatt_for_claim`), exakt das Muster der anderen Claim-Views. `REVOKE anon` = kein anon-Leak.

- [ ] **Step 2: Anwenden** — `apply_migration({ name: 'v_werkstatt_auftrag_view', query: <DDL> })`.
- [ ] **Step 3: Version ablesen + File committen** als `supabase/migrations/<V4>_v_werkstatt_auftrag_view.sql`.
- [ ] **Step 4: Verifizieren (Spalten)** — `execute_sql: SELECT array_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name='v_werkstatt_auftrag';` Expected: alle 23 oben gelisteten Spalten.

---

### Task 4: Cross-Rollen-RLS-Smoke gegen Prod + check-claim-view-rls grün

**Files:** keine (Verifikation; der Ratchet ist der Regressions-Net).

- [ ] **Step 1: 2 Test-Aufträge seeden** — Werkstatt A + B (je mit `user_id`) an je einen Claim hängen (via `reparatur_werkstatt_id`, service-role execute_sql). Falls schon 2 werkstatt-verlinkte Claims mit unterschiedlichen `user_id`-Werkstätten existieren (7 claims_mit_werkstatt vorhanden) → diese nutzen, KEIN Seed. IDs der 2 Werkstatt-User + 2 Claims festhalten.
- [ ] **Step 2: Pro Rolle simulieren** (`set local role authenticated; set local request.jwt.claims`), je eigene execute_sql:
  - Werkstatt-A-User: `SELECT count(*), array_agg(claim_id) FROM v_werkstatt_auftrag` → sieht NUR A-Claim, NICHT B.
  - Werkstatt-B-User: NUR B-Claim.
  - Staff (admin `bdfe432b-250e-4dec-8bdd-f5d6ac04d910`): sieht beide (+ alle).
  - Kunde (`113aebe5-0630-4753-809a-6756df5ba432`), Makler (`bbbb2222-0000-4000-8000-000000000020`): `count=0`.
  Expected: A→nur A, B→nur B, Staff→alle, Kunde/Makler→0.
- [ ] **Step 3: Test-Zeilen aufräumen** — falls in Step 1 geseedet: die Seeds wieder DELETE (service-role). Falls Bestand genutzt: nichts.
- [ ] **Step 4: check-claim-view-rls grün** — im rls-safety-net-Worktree (hat node_modules + die aktualisierte Audit-Fn ist in prod): `node scripts/check-claim-view-rls.mjs` → grün, KEIN Flag von `v_werkstatt_auftrag` (weil is_werkstatt_for_claim jetzt registriert + Nobody sieht 0). Falls #3361-Script lokal nicht verfügbar: direkt `SELECT * FROM audit_ungated_definer_views()` (v_werkstatt_auftrag NICHT enthalten) + `SELECT * FROM audit_claim_views_leaking_to_nobody()` (leer).

---

### Task 5: Ansprechpartner-Erfassung im Admin-Werkstatt-Formular

**Files:**
- Modify: `src/app/admin/werkstaetten/actions.ts`
- Modify: `src/app/admin/werkstaetten/WerkstaettenClient.tsx`
- Test: `src/app/admin/werkstaetten/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `werkstaetten.ansprechpartner_name` (Task 2).

- [ ] **Step 1: Failing Test** — in `__tests__/actions.test.ts` einen Test ergänzen, der prüft, dass die Create/Update-Action `ansprechpartner_name` in den DB-Insert/Update-Payload übernimmt. (Muster der bestehenden Tests in der Datei folgen — sie mocken den Supabase-Client; assert dass `.insert`/`.update` mit `ansprechpartner_name: 'Max Muster'` aufgerufen wird.)
- [ ] **Step 2: Test laufen → FAIL** — `npm run test -- src/app/admin/werkstaetten` → FAIL (Feld wird nicht durchgereicht).
- [ ] **Step 3: Action erweitern** — in `actions.ts` das Create/Update-Payload-Objekt um `ansprechpartner_name` ergänzen (aus dem Input; Typ `string | null`). Bestehendem Field-Muster der Datei folgen.
- [ ] **Step 4: Formular-Feld** — in `WerkstaettenClient.tsx` ein Eingabefeld „Ansprechpartner / Geschäftsführer" ergänzen (Label + Input, echte Umlaute), gebunden an den Form-State, an die Action übergeben. Bestehende Feld-Komponenten der Datei wiederverwenden (kein handgerolltes Markup wenn ein Shared-Field existiert).
- [ ] **Step 5: Test laufen → PASS** — `npm run test -- src/app/admin/werkstaetten` → PASS.
- [ ] **Step 6: tsc + Build-Check** — `npx tsc --noEmit` grün (Admin-Route → bei Bedarf `npm run build`).
- [ ] **Step 7: Commit** — mit 7-Punkte-Audit im Body.

---

## Self-Review (writing-plans)

- **Spec-Coverage:** Teil 1 (Column=Task 2, Erfassung=Task 5) ✓ · Teil 2a (Helfer=Task 1) ✓ · Teil 2b (View=Task 3) ✓ · Safety-Net-Registrierung (Task 1 Step 5) ✓ · Testing (Task 4) ✓ · Teil 3 (Portal) bewusst raus (Spec-Scope-Grenze) ✓.
- **Platzhalter:** DDL vollständig + gegroundet; Task-5-Test folgt dem bestehenden Test-Muster der Datei (kein erfundener Test-Code, da die Datei die Supabase-Mock-Konvention vorgibt) — der Implementierer liest 1 bestehenden Test + spiegelt ihn. Kein „TODO/TBD".
- **Typ-Konsistenz:** `is_werkstatt_for_claim(uuid)→boolean` in Task 1 definiert, in Task 3 View + Task 4 Smoke identisch genutzt. `ansprechpartner_name text` in Task 2 definiert, in Task 3 View + Task 5 Action identisch. View-Spaltennamen in Task 3 definiert = in Task 4 Smoke genutzt (`claim_id`).
