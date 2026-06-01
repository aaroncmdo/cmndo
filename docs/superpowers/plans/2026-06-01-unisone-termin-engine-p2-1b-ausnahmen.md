# Unisone Termin-Engine — Phase 2.1b (Verfügbarkeits-Ausnahmen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **DDL fährt der Controller selbst (Regel 2), Code + 2-stufiges Review via Subagent.**

**Goal:** Einmalige/temporäre Nicht-Verfügbarkeit (`urlaub`/`krank`/`sperre`) als assignee-generische Tabelle `verfuegbarkeits_ausnahmen` anlegen und **in `v_belegung` einfließen lassen** (3. UNION-Branch `belegung_typ='ausnahme'`) — damit `pruefeBelegung`/`ladeBelegung` (P2.1a) automatisch vakanz-bewusst werden (Buchung-während-Urlaub physisch sichtbar als `belegt`), ohne Engine-Logikänderung.

**Architecture:** Additiv. Neue Tabelle (0-Kollision — kein anderer Consumer kennt sie). `v_belegung` (einziger Consumer = die heute gemergte Engine) wird per `CREATE OR REPLACE VIEW` um einen dritten Branch erweitert, Security-Lock (`security_invoker`+REVOKE) re-appliziert. Engine-Änderung = **eine** Type-Union (`BelegungTyp += 'ausnahme'`); `rowToFenster`/`ladeBelegung`/`pruefeBelegung` unverändert (verarbeiten jeden `belegung_typ`). `freieSlots` ist **NICHT** hier — das ist P2.1c.

**Tech Stack:** PostgreSQL/Supabase (DDL **nur** via `mcp__plugin_supabase_supabase__apply_migration`, AGENTS.md Regel 2), TypeScript/Next.js 16, Vitest, tsx-Verify (Muster `verify-engine-belegung.mts`).

---

## ⚠️ Koordination

- **DDL auf geteilter prod+staging-DB** (`paizkjajbuxxksdoycev`). Vor JEDER Migration Live-Recheck gegen `information_schema` ([[information_schema-Check vor Cluster-Refactor]]) — andere Sessions applizieren parallel Migrationen.
- **Risiko-Profil niedrig:** `verfuegbarkeits_ausnahmen` ist brandneu (niemand referenziert eine noch nicht existierende Tabelle). `v_belegung` hat als einzigen Consumer die heute (#2196) gemergte Engine (`createAdminClient`/service_role) — `CREATE OR REPLACE VIEW` ändert nur den Query-Body (gleiche 12 Spalten), bricht keinen Reader.
- **Regel 2:** apply_migration → `list_migrations` → File exakt nach getrackter Version benennen (Twin-Drift). **Regel 1:** PR gegen `staging`. **Regel 3:** kein unbegleiteter Stash.
- **Branch:** frisch `kitta/unisone-termin-engine-p2-1b` aus `origin/staging` (P2.1a ist drin). [[staging/main Commit-Divergenz kosmetisch]] / Branch-Lesson aus P2.1a: pro Sub-Phase frisch aus staging.
- 7-Punkte-Audit in jeder Commit-Message. **[[Write-Tool </content>-Artefakt]]** nach jedem Write scannen.

---

## Live-Grounding (01.06., verifiziert)
- `verfuegbarkeits_ausnahmen` = **ABSENT**. `v_belegung` present. `gen_random_uuid` vorhanden.
- `gutachter_termine_validate_assignee()` existiert (SECURITY DEFINER, `search_path=''`) und ist **generisch über `NEW.assignee_typ`/`NEW.assignee_id`** (validiert gegen sachverstaendige/sv_leads/profiles[rolle=kundenbetreuer]/kanzleien) → **wird als Integritäts-Trigger der neuen Tabelle wiederverwendet** (DRY, kein Duplikat).
- Aktuelle `v_belegung`-DDL (Branch 1 buchung aus gutachter_termine, Branch 2 extern aus sv_kalender_events_cache) + Lock (`security_invoker=true`, `REVOKE ALL FROM anon, authenticated`) — siehe Migrationen `20260601180231` + `181218`.

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `supabase/migrations/<V1>_verfuegbarkeits_ausnahmen.sql` | Tabelle + CHECKs + Index + Integritäts-Trigger (reuse) + RLS/REVOKE | Create (Controller-DDL) |
| `supabase/migrations/<V2>_v_belegung_ausnahmen_branch.sql` | `v_belegung` um `ausnahme`-UNION erweitern + Security-Lock re-appliziert | Create (Controller-DDL) |
| `src/lib/termine/engine/types.ts` | `BelegungTyp` + `VBelegungRow.belegung_typ` um `'ausnahme'` | Modify |
| `src/lib/termine/engine/belegung.test.ts` | rowToFenster-Case für `ausnahme` | Modify |
| `scripts/verify-engine-ausnahmen.mts` | Live-Verify: injizierte Ausnahme → `pruefeBelegung`='belegt' + `ladeBelegung` zeigt `ausnahme` → Cleanup | Create |

`<Vn>` = vom Plugin vergebene getrackte Version (nicht raten).

---

## Task 1: Tabelle `verfuegbarkeits_ausnahmen` (Controller-DDL, Regel 2)

- [ ] **Step 1: RED + Live-Recheck**

`execute_sql` (READ):
```sql
SELECT coalesce(to_regclass('public.verfuegbarkeits_ausnahmen')::text,'ABSENT') AS tbl;
```
Expected: `ABSENT`. (Falls vorhanden → andere Session war schneller → stop + abstimmen.)

- [ ] **Step 2: Migration anwenden (Plugin)**

`apply_migration({ name: "verfuegbarkeits_ausnahmen", query: <DDL> })`:
```sql
CREATE TABLE public.verfuegbarkeits_ausnahmen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_typ text NOT NULL,
  assignee_id  uuid NOT NULL,
  von          timestamptz NOT NULL,
  bis          timestamptz NOT NULL,
  typ          text NOT NULL,
  grund        text,
  erstellt_am  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verfuegbarkeits_ausnahmen_typ_check
    CHECK (typ = ANY (ARRAY['urlaub','krank','sperre'])),
  CONSTRAINT verfuegbarkeits_ausnahmen_assignee_typ_check
    CHECK (assignee_typ = ANY (ARRAY['sachverstaendiger','sv_lead','kundenbetreuer','kanzlei'])),
  CONSTRAINT verfuegbarkeits_ausnahmen_zeitraum_check
    CHECK (von < bis)
);

CREATE INDEX idx_verfuegbarkeits_ausnahmen_assignee
  ON public.verfuegbarkeits_ausnahmen (assignee_typ, assignee_id, von, bis);

-- Integritäts-Trigger: Phase-1-Funktion wiederverwenden (generisch über assignee_typ/_id).
CREATE TRIGGER trg_verfuegbarkeits_ausnahmen_validate_assignee
  BEFORE INSERT OR UPDATE OF assignee_typ, assignee_id ON public.verfuegbarkeits_ausnahmen
  FOR EACH ROW EXECUTE FUNCTION public.gutachter_termine_validate_assignee();

-- Security: RLS an + kein anon/authenticated (Engine liest via service_role). UI-Policy später.
ALTER TABLE public.verfuegbarkeits_ausnahmen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verfuegbarkeits_ausnahmen FROM anon, authenticated;
```

- [ ] **Step 3: GREEN — Struktur + Trigger + Constraints**

```sql
SELECT count(*) AS spalten FROM information_schema.columns
  WHERE table_schema='public' AND table_name='verfuegbarkeits_ausnahmen';   -- 8
SELECT tgname FROM pg_trigger WHERE tgrelid='public.verfuegbarkeits_ausnahmen'::regclass
  AND NOT tgisinternal;                                                     -- trg_..._validate_assignee
SELECT relrowsecurity FROM pg_class WHERE oid='public.verfuegbarkeits_ausnahmen'::regclass; -- t
-- Trigger blockt ungültige assignee_id:
DO $$ BEGIN
  INSERT INTO public.verfuegbarkeits_ausnahmen(assignee_typ,assignee_id,von,bis,typ)
    VALUES ('kanzlei','00000000-0000-0000-0000-000000000000', now(), now()+interval '1 day','sperre');
  RAISE EXCEPTION 'TRIGGER HAT NICHT GEBLOCKT';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE '%nicht in kanzleien%' THEN RAISE NOTICE 'OK: Trigger blockt';
  ELSE RAISE; END IF;
END $$;
```
Expected: `spalten=8`, Trigger da, RLS=`t`, `NOTICE: OK: Trigger blockt`.

- [ ] **Step 4: Version ablesen + File committen**

`list_migrations` → `<V1>`. `supabase/migrations/<V1>_verfuegbarkeits_ausnahmen.sql` mit obigem DDL anlegen + committen (7-Punkt-Audit).

---

## Task 2: `v_belegung` um `ausnahme`-Branch erweitern (Controller-DDL, Regel 2)

- [ ] **Step 1: RED — Ausnahmen noch nicht in der View**

```sql
SELECT count(*) FROM public.v_belegung WHERE belegung_typ='ausnahme';
```
Expected: `0` (Tabelle leer → noch keine, aber auch der Branch fehlt; nach Task 2 = real). Zusätzlich Spaltenform sichern:
```sql
SELECT string_agg(column_name,', ' ORDER BY ordinal_position)
  FROM information_schema.columns WHERE table_schema='public' AND table_name='v_belegung';
```
Expected unverändert: `assignee_typ, assignee_id, start_zeit, end_zeit, belegung_typ, status, termin_typ, bezug_typ, bezug_id, standort_lat, standort_lng, quelle_id`.

- [ ] **Step 2: View-Replace anwenden (Plugin)**

`apply_migration({ name: "v_belegung_ausnahmen_branch", query: <DDL> })`:
```sql
CREATE OR REPLACE VIEW public.v_belegung AS
SELECT
  COALESCE(gt.assignee_typ,
    CASE WHEN gt.sv_id      IS NOT NULL THEN 'sachverstaendiger'
         WHEN gt.sv_lead_id IS NOT NULL THEN 'sv_lead'
         WHEN gt.kb_id      IS NOT NULL THEN 'kundenbetreuer' END) AS assignee_typ,
  COALESCE(gt.assignee_id, gt.sv_id, gt.sv_lead_id, gt.kb_id)      AS assignee_id,
  gt.start_zeit,
  gt.end_zeit,
  'buchung'::text AS belegung_typ,
  gt.status,
  gt.typ          AS termin_typ,
  CASE WHEN gt.claim_id IS NOT NULL THEN 'claim'
       WHEN gt.fall_id  IS NOT NULL THEN 'fall'
       WHEN gt.lead_id  IS NOT NULL THEN 'lead' END AS bezug_typ,
  COALESCE(gt.claim_id, gt.fall_id, gt.lead_id)       AS bezug_id,
  COALESCE(gt.besichtigungsort_lat, sv.standort_lat)  AS standort_lat,
  COALESCE(gt.besichtigungsort_lng, sv.standort_lng)  AS standort_lng,
  gt.id AS quelle_id
FROM public.gutachter_termine gt
LEFT JOIN public.sachverstaendige sv
  ON sv.id = COALESCE(gt.assignee_id, gt.sv_id)
WHERE gt.cancelled_at IS NULL
  AND gt.status = ANY (ARRAY['reserviert','bestaetigt','verlegt','verlegung_pending'])
UNION ALL
SELECT
  'sachverstaendiger'::text AS assignee_typ,
  c.sv_id                   AS assignee_id,
  c.start_zeit,
  c.end_zeit,
  'extern'::text AS belegung_typ,
  NULL::text AS status,
  NULL::text AS termin_typ,
  NULL::text AS bezug_typ,
  NULL::uuid AS bezug_id,
  sv.standort_lat,
  sv.standort_lng,
  c.id AS quelle_id
FROM public.sv_kalender_events_cache c
LEFT JOIN public.sachverstaendige sv ON sv.id = c.sv_id
UNION ALL
-- NEU: Verfügbarkeits-Ausnahmen (urlaub/krank/sperre) als Belegung. Kein Ort (keine
-- Routing-Destination); typ wird im status-Feld transportiert (informativ).
SELECT
  va.assignee_typ,
  va.assignee_id,
  va.von  AS start_zeit,
  va.bis  AS end_zeit,
  'ausnahme'::text AS belegung_typ,
  va.typ  AS status,
  NULL::text AS termin_typ,
  NULL::text AS bezug_typ,
  NULL::uuid AS bezug_id,
  NULL::numeric AS standort_lat,
  NULL::numeric AS standort_lng,
  va.id AS quelle_id
FROM public.verfuegbarkeits_ausnahmen va;

-- Security-Lock re-applizieren (CREATE OR REPLACE setzt reloptions/Grants nicht garantiert neu):
ALTER VIEW public.v_belegung SET (security_invoker = true);
REVOKE ALL ON public.v_belegung FROM anon, authenticated;
```

- [ ] **Step 3: GREEN — View intakt + Branch da + Lock hält**

```sql
SELECT string_agg(column_name,', ' ORDER BY ordinal_position)
  FROM information_schema.columns WHERE table_schema='public' AND table_name='v_belegung';
-- unverändert 12 Spalten (s.o.)
SELECT reloptions FROM pg_class WHERE oid='public.v_belegung'::regclass;  -- {security_invoker=true}
SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='v_belegung';
-- nur postgres/service_role (kein anon/authenticated)
-- Smoke-Insert einer Ausnahme für einen echten SV, dann in der View sichtbar:
WITH sv AS (SELECT id FROM public.sachverstaendige LIMIT 1)
INSERT INTO public.verfuegbarkeits_ausnahmen(assignee_typ,assignee_id,von,bis,typ,grund)
  SELECT 'sachverstaendiger', id, now()+interval '400 day', now()+interval '407 day','urlaub','VERIFY-P21B' FROM sv
  RETURNING id;
SELECT belegung_typ, status FROM public.v_belegung
  WHERE quelle_id = (SELECT id FROM public.verfuegbarkeits_ausnahmen WHERE grund='VERIFY-P21B');
-- erwartet: belegung_typ='ausnahme', status='urlaub'
DELETE FROM public.verfuegbarkeits_ausnahmen WHERE grund='VERIFY-P21B';
```
Expected: 12 Spalten unverändert, `security_invoker=true`, Grants nur postgres/service_role, der injizierte Ausnahme-Row erscheint als `ausnahme`/`urlaub` und wird wieder gelöscht.

- [ ] **Step 4: Version ablesen + File committen**

`list_migrations` → `<V2>`. File anlegen + committen.

---

## Task 3: Engine-Type `BelegungTyp += 'ausnahme'` (Code, Subagent + TDD)

**Files:** Modify `src/lib/termine/engine/types.ts`, `src/lib/termine/engine/belegung.test.ts`

- [ ] **Step 1: Failing-Test (rowToFenster mappt `ausnahme`)**

In `belegung.test.ts` einen Case ergänzen:
```typescript
  it('mappt eine Ausnahme (ausnahme) — typ im status, kein Ort', () => {
    const row: VBelegungRow = {
      assignee_typ: 'sachverstaendiger',
      assignee_id: 'sv-1',
      start_zeit: '2026-07-01T00:00:00Z',
      end_zeit: '2026-07-08T00:00:00Z',
      belegung_typ: 'ausnahme',
      status: 'urlaub',
      termin_typ: null,
      bezug_typ: null,
      bezug_id: null,
      standort_lat: null,
      standort_lng: null,
      quelle_id: 'va-1',
    }
    const f = rowToFenster(row)
    expect(f.belegungTyp).toBe('ausnahme')
    expect(f.status).toBe('urlaub')
    expect(f.standortLat).toBeNull()
  })
```

- [ ] **Step 2: RED**

Run: `cd "<WT>" && npm test -- src/lib/termine/engine/belegung.test.ts`
Expected: FAIL — `belegung_typ: 'ausnahme'` ist nicht zuweisbar (Type `'buchung'|'extern'`).

- [ ] **Step 3: Type erweitern**

In `types.ts`:
```typescript
export type BelegungTyp = 'buchung' | 'extern' | 'ausnahme'
```
und in `VBelegungRow`:
```typescript
  belegung_typ: 'buchung' | 'extern' | 'ausnahme'
```
(`rowToFenster`/`ladeBelegung`/`pruefeBelegung` bleiben unverändert.)

- [ ] **Step 4: GREEN + tsc**

```bash
cd "<WT>" && npm test -- src/lib/termine/engine/belegung.test.ts   # 3/3 PASS
cd "<WT>" && npx tsc --noEmit                                       # PASS
```

- [ ] **Step 5: Commit** (7-Punkt-Audit).

---

## Task 4: Live-Verify (Controller) — Vakanz-Bewusstsein end-to-end

**Files:** Create `scripts/verify-engine-ausnahmen.mts`

- [ ] **Step 1: Script schreiben** (Muster `verify-engine-belegung.mts`): wählt einen realen SV, injiziert eine Ausnahme in 400 Tagen (kollidiert mit nichts), prüft:
  - `pruefeBelegung({typ:'sachverstaendiger', id:svId}, von, bis)` === `'belegt'` (vorher im selben Fenster `'frei'`)
  - `ladeBelegung(...)` enthält ein `belegungTyp:'ausnahme'`-Fenster mit `status:'urlaub'`
  - Cleanup (DELETE der injizierten Zeile) — **immer**, auch bei Fehler (try/finally).

```typescript
// ... loadEnv wie in verify-engine-belegung.mts ...
const { createAdminClient } = await import('@/lib/supabase/admin')
const { ladeBelegung, pruefeBelegung } = await import('@/lib/termine/engine')
const db = createAdminClient()
const { data: sv } = await db.from('sachverstaendige').select('id').limit(1).maybeSingle()
const svId = sv?.id as string
const a = { typ: 'sachverstaendiger' as const, id: svId }
const von = '2027-07-01T00:00:00Z', bis = '2027-07-08T00:00:00Z'
const frei_vorher = await pruefeBelegung(a, von, bis, db)
const { data: ins } = await db.from('verfuegbarkeits_ausnahmen')
  .insert({ assignee_typ: 'sachverstaendiger', assignee_id: svId, von, bis, typ: 'urlaub', grund: 'VERIFY-P21B-mts' })
  .select('id').single()
let res: Record<string, unknown> = {}
try {
  const belegt_nachher = await pruefeBelegung(a, von, bis, db)
  const fenster = await ladeBelegung(a, von, bis, db)
  const ausnahme = fenster.find((f) => f.belegungTyp === 'ausnahme')
  res = {
    svId,
    frei_vorher,
    belegt_nachher,
    ausnahme_status: ausnahme?.status ?? null,
    ausnahme_kein_ort: ausnahme ? ausnahme.standortLat === null : false,
    VERDICT: frei_vorher === 'frei' && belegt_nachher === 'belegt'
      && ausnahme?.status === 'urlaub' && ausnahme?.standortLat === null
        ? 'GRUEN' : 'FEHLER',
  }
} finally {
  if (ins?.id) await db.from('verfuegbarkeits_ausnahmen').delete().eq('id', ins.id)
}
console.log(JSON.stringify(res, null, 2))
```

- [ ] **Step 2: Ausführen** (Controller): `cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-ausnahmen.mts && rm -f .env.local` → erwartet `VERDICT: GRUEN`. (`</content>`-Scan.)

- [ ] **Step 3: Commit.**

---

## Task 5: Build-Gate + PR

- [ ] **Step 1:** `cd "<WT>" && npx tsc --noEmit` → PASS.
- [ ] **Step 2:** Typen-Regen weiterhin aufgeschoben (nur Union erweitert, kein neuer Consumer der generierten Typen).
- [ ] **Step 3:** `git push -u origin kitta/unisone-termin-engine-p2-1b` + `gh pr create --base staging` (Body: Audit + Verify-VERDICT + DDL-Beschreibung + „pruefeBelegung jetzt vakanz-bewusst").
- [ ] **Step 4:** Post-Merge: `verify-engine-ausnahmen.mts` gegen staging (Landungs-Beweis).

---

## Self-Review

**Spec-Coverage:** §6c `verfuegbarkeits_ausnahmen` (Tabelle, urlaub/krank/sperre) ✓ (Task 1); „fließen in `v_belegung` ein" ✓ (Task 2); `pruefeBelegung`/(künftig)`freieSlots` berücksichtigen sie ✓ (via v_belegung, Task 4 beweist pruefeBelegung). **Bewusst verschoben:** `freieSlots` (= P2.1c), org-weite Ausnahmen + SV-CRUD-UI (YAGNI, kein Consumer).

**Placeholder-Scan:** keine TBD; alle DDL/Code/Verify vollständig.

**Typ-Konsistenz:** `BelegungTyp`/`VBelegungRow.belegung_typ` beide `'buchung'|'extern'|'ausnahme'`. View-Spalten unverändert 12. Trigger-Funktion `gutachter_termine_validate_assignee` == live (reuse). `von/bis` der Tabelle → `start_zeit/end_zeit` der View.

**Risiko:** `CREATE OR REPLACE VIEW` auf v_belegung — gleiche 12 Spalten, einziger Consumer = Engine (service_role) → bricht nichts; Security-Lock explizit re-appliziert. Neue Tabelle = 0-Kollision.

---

## Roadmap
- **P2.1c — `freieSlots`** (assignee-generisch): Arbeitszeiten je Typ (`sachverstaendige.arbeitszeiten`/`blockierte_wochentage`; `profiles.working_hours`) minus `ladeBelegung` (inkl. ausnahme) minus Vorlauf/Horizont, Reachability/ETA (`precomputeSvSlotEtas`/`isSlotReachable`) first-class; konsolidiert `ladeFreieSlots` + `getAvailableKbSlots`. Rückgabe `TagVerfuegbarkeit[]`.
- **P2.2** (Schema-Adds + Exclusion-Constraint-Generalisierung, riskanteste DDL), **P2.3** (Writes + Geocoding-Garantie + fail-closed `pruefeBelegung` + CMM-73), **P2.4** (`findeBestePerson` + Org-Dedup), **P2.5** (`syncTerminToExternalCalendar`).
