# Unisone Termin-Engine — Phase 2.2 (Schema-Adds + Exclusion-Constraint-Generalisierung) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **DDL fährt der Controller selbst (Regel 2 / Twin-Drift), Code + Verify via Subagent. Der Constraint-Swap (Task 3) ist die riskanteste DDL der Strecke → eigener Koordinations-Gate mit Aarons explizitem Go.**

**Goal:** `gutachter_termine` schema-seitig fertig machen für die Write-Engine (P2.3): die additiven Spalten `quelle`/`bezug_typ`/`bezug_id`/`reserviert_bis` ergänzen UND die Doppelbuchungs-Garantie von `sv_id` auf `(assignee_typ, assignee_id)` generalisieren — **non-regressiv** (jede Buchung bleibt physisch konfliktfrei, auch die von Legacy-Writern, die nur `sv_id` setzen).

**Architecture:** Drei kleine, additive Migrationen + ein assignee-Normalisierungs-Trigger als Sicherheitsnetz. **(A)** Spalten `quelle`/`bezug_typ`/`bezug_id`/`reserviert_bis` als `text`+CHECK bzw. `uuid`/`timestamptz` (Muster: bestehendes `assignee_typ`-CHECK — **kein** enum), `bezug_*` aus den FKs backfillen. **(B)** Trigger `gutachter_termine_normalize_assignee`, der `assignee_typ`/`assignee_id` aus `sv_id`/`sv_lead_id`/`kb_id` füllt, **wenn `assignee_id` NULL ist** — weil **kein einziger heutiger Writer `assignee_id` setzt** (Live-verifiziert: nur 3 Read-Seite-Engine-Files referenzieren die Spalte). **(C)** `DROP CONSTRAINT gutachter_termine_no_sv_overlap` → `ADD gutachter_termine_no_assignee_overlap` (EXCLUDE auf assignee, btree_gist-Opclasses explizit aus `extensions` qualifiziert). Atomar (DROP+ADD in einer Transaktion → ADD-Fehler rollt zum sv_id-Constraint zurück). `v_belegung` bleibt **unberührt** (sie leitet `assignee_*`/`bezug_*` ohnehin schon via COALESCE/CASE ab; die physischen Spalten sind reiner Write-Ziel-Vorrat für P2.3).

**Tech Stack:** PostgreSQL/Supabase (DDL **nur** via `mcp__plugin_supabase_supabase__apply_migration`, AGENTS.md Regel 2), TypeScript/Next.js 16, tsx-Verify (Muster `scripts/verify-engine-belegung.mts`). Build-Gate `npx tsc --noEmit`.

---

## ⚠️ Koordination

- **DDL auf geteilter prod+staging-DB** (`paizkjajbuxxksdoycev`). `gutachter_termine` ist **hoch frequentiert von Parallel-Sessions** (AAR-939-Cluster, CMM-49/50/69/72). Vor JEDER Migration Live-Recheck gegen `information_schema`/`pg_constraint` ([[information_schema-Check vor Cluster-Refactor]]).
- **Task 3 (Constraint-Swap) = HOCHRISIKO-Gate:** unmittelbar davor **`git fetch` + 60s-melden + Live-Recheck** (0 überlappende aktive Paare pro Assignee, 0 aktive Zeilen ohne assignee_id) **+ Aarons explizites Go einholen**. ACCESS-EXCLUSIVE-Lock, aber nur ~19 Zeilen → instant. [[feedback_branch_kollision_absprache]]
- **Regel 1:** PR gegen `staging`, nie main. **Regel 2:** apply_migration → `list_migrations` → File exakt nach getrackter Version benennen (Twin-Drift). **Regel 3:** kein unbegleiteter Stash am Session-Ende.
- **Branch:** `kitta/termin-engine-p2-2`, frisch aus `origin/staging` (Worktree bereits angelegt). Pro Sub-Phase frisch aus staging — `kitta/unisone-termin-engine` ist stale.
- **Split-Option:** Task 1+2 (low-risk additiv) **dürfen** als eigener PR (P2.2a) vorab gemerged werden, falls P2.3 vor dem Constraint-Go starten soll — die Migrationen sind unabhängig (Task 3 nutzt die **P1**-Spalten `assignee_*`, nicht die Task-1-Spalten). Default: alle drei in **einem** P2.2-PR.
- 7-Punkte-Audit in jeder Commit-Message. **[[Write-Tool </content>-Artefakt]]** nach jedem Write scannen.
- **Typen-Regen aufgeschoben** (Regel 2 Schritt 6): kein Consumer nutzt die neuen Spalten vor P2.3 → kein `generate_typescript_types` in dieser Phase.

---

## Live-Grounding (02.06.2026, gegen `paizkjajbuxxksdoycev` verifiziert)

**Tabellen-Stand `gutachter_termine`:** 19 Zeilen total · aktiv (`bestaetigt` 7 / `verlegung_pending` 3 / `verlegt` 2 = **12**) · **0 aktive Zeilen ohne `assignee_id`/`assignee_typ`** (P1-Backfill #2180 vollständig) · **0 überlappende aktive Paare** pro `(assignee_typ, assignee_id)` → Constraint-Swap würde JETZT sauber durchlaufen. Es existieren **0 `reserviert`-Zeilen**.

**Spalten:** `status` = **text** + CHECK (`reserviert, bestaetigt, abgelehnt, abgesagt, storniert, abgeschlossen, sv_gesucht, gegenvorschlag, verschoben, verlegt, verlegung_pending`), default `'bestaetigt'`. `typ` = **text** + CHECK (`sv_begutachtung, kb_beratung, konfrontation`), default `'sv_begutachtung'`, NOT NULL. `assignee_typ` = **text** + CHECK (`sachverstaendiger, sv_lead, kundenbetreuer, kanzlei`), nullable. `assignee_id` uuid nullable.
- **ABSENT (P2.2 fügt hinzu):** `quelle`, `bezug_typ`, `bezug_id`, `reserviert_bis`.
- **PRESENT (Geocoding-Ziel für P2.3, NICHT hier):** `besichtigungsort_lat/lng/adresse/place_id/notiz`. Legacy/Bezug-Quellen: `sv_id`, `sv_lead_id`, `kb_id`, `fall_id`, `lead_id`, `claim_id`.

**Aktueller Exclusion-Constraint** `gutachter_termine_no_sv_overlap`:
```
EXCLUDE USING gist (sv_id WITH =, tstzrange(start_zeit, end_zeit) WITH &&)
  WHERE (status = ANY (ARRAY['bestaetigt','reserviert','verlegt','verlegung_pending']))
```
→ keyt **nur auf `sv_id`** ⇒ **KB-/sv_lead-Buchungen sind heute gar nicht gegen Doppelbuchung geschützt.** Die Generalisierung schließt diese Lücke mit.

**btree_gist** liegt im Schema `extensions`. Default-gist-Opclasses: `extensions.gist_text_ops` (text), `extensions.gist_uuid_ops` (uuid) — beide `opcdefault=true`. Der neue Constraint **qualifiziert sie explizit** → search_path-unabhängig (killt die Handoff-Landmine).

**Trigger auf `gutachter_termine`** (Reihenfolge alphabetisch nach Name):
- `set_gutachter_termine_updated_at` (BEFORE UPDATE) — bumpt `updated_at`.
- `termin_sync_auftrag_status` (AFTER INSERT/UPDATE OF sv_angekommen_am, durchgefuehrt_am, auftrag_id) — **no-opt bei `auftrag_id IS NULL`** (verifiziert) → Test-Inserts ungefährdet.
- `trg_gutachter_termine_validate_assignee` (BEFORE INSERT/UPDATE OF assignee_typ, assignee_id) — `IF assignee_id IS NULL THEN RETURN NEW`, sonst Existenz-Check pro Typ (SECURITY DEFINER, `search_path=''`).
- `trg_validate_gutachter_termine_claim_id` (BEFORE INSERT/UPDATE OF fall_id, claim_id) — wirft **nur** wenn `fall_id` gesetzt UND `claim_id` NULL.
- → Der neue `trg_gutachter_termine_normalize_assignee` (Task 2) sortiert **vor** `…_validate_assignee` (`n` < `v`) → Normalisierung setzt `assignee_*`, **dann** validiert der Bestands-Trigger (sieht populiertes assignee → ok).

**`v_belegung`** leitet `assignee_typ/assignee_id` via `COALESCE(assignee_id, sv_id, sv_lead_id, kb_id)` und `bezug_typ` via `CASE claim_id→'claim', fall_id→'fall', lead_id→'lead'` ab, liest die **physischen** `bezug_*`-Spalten **noch nicht** → P2.2-Adds sind rein additiv, **v_belegung bleibt unverändert** (kein `CREATE OR REPLACE VIEW`, kein Security-Re-Lock nötig).

**Writer-Audit (entscheidend):** Im gesamten `src/` referenzieren **nur 3 Files** `assignee_id`/`assignee_typ` — alle Read-Seite (`engine/{types,belegung,belegung.test}.ts`). **Kein Writer setzt `assignee_id`.** Alle ~30 `gutachter_termine`-Writer schreiben `sv_id`/`sv_lead_id`/`kb_id`. ⇒ Ohne Normalisierungs-Trigger (Task 2) ließe der assignee-gekeyte Constraint **jede neue Buchung ungeschützt** (assignee_id NULL). **Task 2 ist die nicht-verhandelbare Voraussetzung für die Non-Regression von Task 3.**

**Regression-Sicherheit Rename:** Kein App-Code fängt `gutachter_termine_no_sv_overlap` / `23P01` / `exclusion_violation` ab (Grep: nur Docs + Baseline-Snapshot + ein v_belegung-Migrations-Kommentar). Der Constraint-Rename bricht keinen Caller.

---

## Design-Entscheidungen (begründet)

1. **`quelle`/`bezug_typ` als `text`+CHECK, NICHT enum.** P1 hat `assignee_typ` als `text`+CHECK gebaut (nicht enum) — Konvention der Tabelle. Spart `ALTER TYPE … ADD VALUE`-Schmerz und matcht das Bestandsmuster. (Die Design-Spec sagte „enum" generisch; die gelebte Realität ist text+CHECK.)
2. **`bezug_typ`-Wertemenge = `claim`/`fall`/`lead`** (nicht `mandat` wie die Spec). Das ist exakt, was `v_belegung` ableitet und was `engine/types.ts` als `BezugTyp = 'claim'|'fall'|'lead'` deklariert → SSoT-konsistent (`fall` lebt, solange `faelle`/`fall_id` existiert; CMM-44-Drop ist separat).
3. **`bezug_typ`/`bezug_id` Paar-CHECK** (`(bezug_typ IS NULL) = (bezug_id IS NULL)`). Verhindert halb-befüllten polymorphen Bezug — dieselbe Integritäts-Lehre wie der assignee-Validierungs-Trigger (Spec §4a: nicht den `abrechnungen.empfaenger_*`-ohne-Integrität-Fehler wiederholen).
4. **`reserviert_bis` = nullable timestamptz, KEIN Spalten-Default.** Die „15 Min" sind die **Engine-TTL** (P2.3 `reserviere` setzt `now()+15min` explizit), kein Spalten-Default — ein Default würde fälschlich auch `bestaetigt`/`abgeschlossen`-Zeilen stempeln.
5. **assignee-Normalisierungs-Trigger (Task 2) statt COALESCE-Ausdruck im Constraint.** Alternative wäre, den Constraint auf `COALESCE(assignee_id, sv_id, sv_lead_id, kb_id)` zu keyen (kein Trigger). **Verworfen**, weil die Design-Spec §4a `assignee_*` **physisch** befüllt haben will (Integrität, NOT-NULL-Ziel in Phase 3) — der Trigger liefert das + macht `assignee_*` für alle künftigen Consumer/Indizes verlässlich, statt es nur im Constraint-Ausdruck zu derivieren. Phase 3 droppt Trigger + Legacy-Spalten und vereinfacht den Constraint.
6. **Constraint-WHERE identisch zum Bestand** (`status IN (bestaetigt,reserviert,verlegt,verlegung_pending)`) — reine Generalisierung der Key-Spalten, **keine** Semantik-Änderung (kein `cancelled_at`-Zusatz; das wäre ein separates Verhaltens-Ticket).
7. **Kein zusätzlicher btree-Index auf `(assignee_typ, assignee_id)`** (YAGNI): der EXCLUDE-gist-Index deckt das `eq/eq/range`-Lesemuster, und 19 Zeilen sind irrelevant. Index-Tuning ist Phase-3-Sache nach dem Reader-Sweep.

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `supabase/migrations/<V1>_gutachter_termine_p2_2_schema_adds.sql` | Spalten `quelle`/`bezug_typ`/`bezug_id`/`reserviert_bis` + CHECKs + `bezug_*`-Backfill | Create (Controller-DDL) |
| `supabase/migrations/<V2>_gutachter_termine_normalize_assignee.sql` | Trigger-Funktion + Trigger: `assignee_*` aus Legacy-Spalten füllen wenn NULL | Create (Controller-DDL) |
| `supabase/migrations/<V3>_gutachter_termine_exclusion_assignee.sql` | `DROP gutachter_termine_no_sv_overlap` → `ADD gutachter_termine_no_assignee_overlap` (+ COMMENT) | Create (Controller-DDL, **Aaron-Go**) |
| `scripts/verify-engine-p2-2-constraint.mts` | Live-Verify: assignee-Doppelbuchung blockt, Legacy-`sv_id`-Pfad blockt (Non-Regression), Non-Overlap ok, neue Spalten beschreibbar | Create |

`<Vn>` = vom Plugin vergebene getrackte Version (`list_migrations` ablesen, **nicht** raten).

---

## Task 1: Additive Spalten + CHECKs + `bezug_*`-Backfill (Controller-DDL, Regel 2)

**Files:** Create `supabase/migrations/<V1>_gutachter_termine_p2_2_schema_adds.sql`

- [ ] **Step 1: RED + Live-Recheck** — `execute_sql` (READ):

```sql
SELECT string_agg(column_name, ',' ORDER BY column_name) AS vorhandene_neue
FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachter_termine'
  AND column_name = ANY (ARRAY['quelle','bezug_typ','bezug_id','reserviert_bis']);
```
Expected: leer/`null` (keine der vier existiert). Falls eine da ist → andere Session war schneller → stop + abstimmen.

- [ ] **Step 2: Migration anwenden (Plugin)** — `apply_migration({ name: "gutachter_termine_p2_2_schema_adds", query: <DDL> })`:

```sql
-- P2.2 (Unisone Termin-Engine): additive Schema-Adds. Rein additiv, low-risk.
-- quelle/bezug_typ als text+CHECK (Muster: bestehendes gutachter_termine_assignee_typ_check),
-- bewusst KEIN enum. bezug_typ-Werte = claim/fall/lead (== v_belegung-Ableitung + engine BezugTyp).
ALTER TABLE public.gutachter_termine
  ADD COLUMN quelle         text,
  ADD COLUMN bezug_typ      text,
  ADD COLUMN bezug_id       uuid,
  ADD COLUMN reserviert_bis timestamptz;

ALTER TABLE public.gutachter_termine
  ADD CONSTRAINT gutachter_termine_quelle_check
    CHECK (quelle IS NULL OR quelle = ANY (ARRAY['dispatch','self_service','manuell'])),
  ADD CONSTRAINT gutachter_termine_bezug_typ_check
    CHECK (bezug_typ IS NULL OR bezug_typ = ANY (ARRAY['claim','fall','lead'])),
  -- bezug_typ und bezug_id sind ein Paar: beide NULL oder beide gesetzt.
  ADD CONSTRAINT gutachter_termine_bezug_paar_check
    CHECK ((bezug_typ IS NULL) = (bezug_id IS NULL));

-- Backfill bezug_* aus bestehenden FKs (Präzedenz wie v_belegung: claim > fall > lead).
-- Bumpt updated_at (set_…_updated_at-Trigger) auf den betroffenen ~Zeilen — bei einer
-- Einmal-Migration akzeptiert; feuert KEINEN assignee-/claim-/auftrag-Trigger (andere Spalten).
UPDATE public.gutachter_termine
SET bezug_typ = CASE
      WHEN claim_id IS NOT NULL THEN 'claim'
      WHEN fall_id  IS NOT NULL THEN 'fall'
      WHEN lead_id  IS NOT NULL THEN 'lead'
    END,
    bezug_id = COALESCE(claim_id, fall_id, lead_id)
WHERE bezug_typ IS NULL
  AND (claim_id IS NOT NULL OR fall_id IS NOT NULL OR lead_id IS NOT NULL);
```

- [ ] **Step 3: GREEN — Spalten + CHECKs + Backfill-Konsistenz** — `execute_sql` (READ):

```sql
-- 4 neue Spalten da:
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachter_termine'
  AND column_name = ANY (ARRAY['quelle','bezug_typ','bezug_id','reserviert_bis'])
ORDER BY column_name;                          -- 4 Zeilen, alle nullable
-- 3 neue CHECKs da:
SELECT conname FROM pg_constraint WHERE conrelid='public.gutachter_termine'::regclass
  AND conname = ANY (ARRAY['gutachter_termine_quelle_check','gutachter_termine_bezug_typ_check','gutachter_termine_bezug_paar_check']);
-- Backfill == v_belegung-Ableitung (0 Abweichung):
SELECT count(*) AS bezug_mismatch FROM public.gutachter_termine
WHERE COALESCE(bezug_typ,'') <> COALESCE(CASE WHEN claim_id IS NOT NULL THEN 'claim'
    WHEN fall_id IS NOT NULL THEN 'fall' WHEN lead_id IS NOT NULL THEN 'lead' END,'')
   OR COALESCE(bezug_id::text,'') <> COALESCE(COALESCE(claim_id,fall_id,lead_id)::text,'');
-- Paar-Invariante hält:
SELECT count(*) AS paar_verletzt FROM public.gutachter_termine
WHERE (bezug_typ IS NULL) <> (bezug_id IS NULL);
```
Expected: 4 Spalten (alle `YES` nullable), 3 CHECKs, `bezug_mismatch=0`, `paar_verletzt=0`.

- [ ] **Step 4: Version ablesen + File committen** — `list_migrations` → `<V1>`. `supabase/migrations/<V1>_gutachter_termine_p2_2_schema_adds.sql` mit obigem DDL anlegen, `</content>`-Scan, committen (7-Punkt-Audit).

---

## Task 2: assignee-Normalisierungs-Trigger (Controller-DDL, Regel 2) — Non-Regression-Voraussetzung

**Files:** Create `supabase/migrations/<V2>_gutachter_termine_normalize_assignee.sql`

**Warum:** Kein Writer setzt `assignee_id` (Live-Audit). Der Trigger füllt `assignee_*` aus den Legacy-Spalten **wenn `assignee_id` NULL ist** → der assignee-Constraint (Task 3) schützt damit auch jede Legacy-Buchung. „Populate-when-null" respektiert künftige Phase-3-Writer, die `assignee_*` direkt setzen.

- [ ] **Step 1: RED + Live-Recheck** — `execute_sql` (READ):

```sql
SELECT count(*) AS schon_da FROM pg_trigger
WHERE tgrelid='public.gutachter_termine'::regclass
  AND tgname='trg_gutachter_termine_normalize_assignee';
```
Expected: `0`.

- [ ] **Step 2: Migration anwenden (Plugin)** — `apply_migration({ name: "gutachter_termine_normalize_assignee", query: <DDL> })`:

```sql
-- P2.2: assignee_* aus Legacy-Spalten (sv_id/sv_lead_id/kb_id) ableiten, WENN assignee_id NULL.
-- Sortiert per Name vor trg_gutachter_termine_validate_assignee ('n' < 'v') → der Bestands-
-- Validierungstrigger sieht das populierte assignee. kanzlei hat keine Legacy-Spalte → wird
-- direkt geschrieben (Phase 3+), daher hier nicht abgedeckt.
CREATE OR REPLACE FUNCTION public.gutachter_termine_normalize_assignee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.assignee_id IS NULL THEN
    IF NEW.sv_id IS NOT NULL THEN
      NEW.assignee_typ := 'sachverstaendiger';
      NEW.assignee_id  := NEW.sv_id;
    ELSIF NEW.sv_lead_id IS NOT NULL THEN
      NEW.assignee_typ := 'sv_lead';
      NEW.assignee_id  := NEW.sv_lead_id;
    ELSIF NEW.kb_id IS NOT NULL THEN
      NEW.assignee_typ := 'kundenbetreuer';
      NEW.assignee_id  := NEW.kb_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_gutachter_termine_normalize_assignee
  BEFORE INSERT OR UPDATE OF sv_id, sv_lead_id, kb_id, assignee_typ, assignee_id
  ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.gutachter_termine_normalize_assignee();
```

- [ ] **Step 3: GREEN — Trigger da + füllt assignee (transaktional, kein Reststaat)** — `execute_sql` (READ/DO mit ROLLBACK-Beweis):

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid='public.gutachter_termine'::regclass
  AND tgname='trg_gutachter_termine_normalize_assignee';                 -- 1 Zeile
-- Beweis ohne Reststaat: in einer Subtransaktion einen sv_id-only-Insert machen,
-- assignee prüfen, dann gezielt RAISE → Rollback (nichts bleibt liegen).
DO $$
DECLARE v_sv uuid; v_typ text; v_aid uuid;
BEGIN
  SELECT id INTO v_sv FROM public.sachverstaendige LIMIT 1;
  INSERT INTO public.gutachter_termine (sv_id, typ, start_zeit, end_zeit, status, notiz_intern)
    VALUES (v_sv, 'sv_begutachtung', '2099-01-02T09:00:00Z','2099-01-02T10:00:00Z','bestaetigt','VERIFY-P2-2-DO')
    RETURNING assignee_typ, assignee_id INTO v_typ, v_aid;
  IF v_typ = 'sachverstaendiger' AND v_aid = v_sv THEN
    RAISE EXCEPTION 'NORMALIZE_OK';   -- Rollback: Insert wird verworfen
  ELSE
    RAISE EXCEPTION 'NORMALIZE_FEHLER typ=% aid=%', v_typ, v_aid;
  END IF;
END $$;
```
Expected: Fehler `NORMALIZE_OK` (= Trigger hat `assignee_*` korrekt gefüllt; der Insert ist durch das `RAISE` zurückgerollt, **keine** Test-Zeile bleibt). Danach Gegenprobe `SELECT count(*) FROM gutachter_termine WHERE notiz_intern='VERIFY-P2-2-DO';` → `0`.

- [ ] **Step 4: Version ablesen + File committen** — `list_migrations` → `<V2>`. File anlegen, `</content>`-Scan, committen.

---

## Task 3: Exclusion-Constraint-Generalisierung (Controller-DDL, **HOCHRISIKO — Aaron-Go-Gate**)

**Files:** Create `supabase/migrations/<V3>_gutachter_termine_exclusion_assignee.sql`

- [ ] **Step 1: Koordinations-Gate + Live-Recheck (Pflicht, unmittelbar davor)**
  1. `git fetch origin staging` + andere aktive Sessions melden, 60s warten ([[feedback_branch_kollision_absprache]]).
  2. `execute_sql` (READ) — der Swap ist nur sicher, wenn beide `0` sind:
  ```sql
  -- (a) 0 aktive Zeilen ohne assignee (sonst ungeschützt nach Swap):
  SELECT count(*) AS aktive_ohne_assignee FROM public.gutachter_termine
  WHERE status = ANY (ARRAY['bestaetigt','reserviert','verlegt','verlegung_pending'])
    AND assignee_id IS NULL;
  -- (b) 0 überlappende aktive Paare pro Assignee (sonst schlägt ADD fehl):
  SELECT count(*) AS overlap_paare FROM public.gutachter_termine a
  JOIN public.gutachter_termine b ON a.id < b.id
    AND a.assignee_typ=b.assignee_typ AND a.assignee_id=b.assignee_id
    AND tstzrange(a.start_zeit,a.end_zeit) && tstzrange(b.start_zeit,b.end_zeit)
  WHERE a.status = ANY (ARRAY['bestaetigt','reserviert','verlegt','verlegung_pending'])
    AND b.status = ANY (ARRAY['bestaetigt','reserviert','verlegt','verlegung_pending'])
    AND a.assignee_id IS NOT NULL;
  -- (c) alter Constraint noch da?
  SELECT conname FROM pg_constraint WHERE conrelid='public.gutachter_termine'::regclass
    AND conname='gutachter_termine_no_sv_overlap';
  ```
  Expected: `aktive_ohne_assignee=0`, `overlap_paare=0`, `gutachter_termine_no_sv_overlap` vorhanden. **Bei (a)>0 oder (b)>0 → NICHT swappen, an Aaron + Cluster eskalieren.**
  3. **Aarons explizites Go einholen.** Erst dann Step 2.

- [ ] **Step 2: Migration anwenden (Plugin)** — `apply_migration({ name: "gutachter_termine_exclusion_assignee", query: <DDL> })`:

```sql
-- P2.2 HOCHRISIKO: Doppelbuchungs-Garantie von sv_id auf (assignee_typ, assignee_id)
-- generalisieren. Atomar (DROP+ADD in EINER Transaktion): schlägt ADD fehl, rollt alles
-- zurück → der alte sv_id-Constraint bleibt erhalten. Opclasses EXPLIZIT aus extensions
-- (btree_gist liegt dort) → search_path-unabhängig. tstzrange &&-Opclass ist core (pg_catalog).
ALTER TABLE public.gutachter_termine
  DROP CONSTRAINT gutachter_termine_no_sv_overlap;

ALTER TABLE public.gutachter_termine
  ADD CONSTRAINT gutachter_termine_no_assignee_overlap
  EXCLUDE USING gist (
    assignee_typ extensions.gist_text_ops WITH =,
    assignee_id  extensions.gist_uuid_ops WITH =,
    tstzrange(start_zeit, end_zeit) WITH &&
  )
  WHERE (status = ANY (ARRAY['bestaetigt','reserviert','verlegt','verlegung_pending']));

COMMENT ON CONSTRAINT gutachter_termine_no_assignee_overlap ON public.gutachter_termine IS
  'AAR-865 generalisiert (Termin-Engine P2.2): verhindert Doppelbuchung pro Assignee '
  '(assignee_typ+assignee_id), nicht mehr nur pro sv_id — schließt KB/sv_lead-Lücke. '
  'Greift nur für blockierende Status (bestaetigt/reserviert/verlegt/verlegung_pending); '
  'abgesagte/stornierte/abgelehnte Slots dürfen überlappen.';
```

- [ ] **Step 3: GREEN — neuer Constraint korrekt, alter weg** — `execute_sql` (READ):

```sql
SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
WHERE conrelid='public.gutachter_termine'::regclass
  AND conname='gutachter_termine_no_assignee_overlap';
-- erwartet: EXCLUDE USING gist (assignee_typ WITH =, assignee_id WITH =, tstzrange(...) WITH &&)
--           WHERE (status = ANY (ARRAY['bestaetigt','reserviert','verlegt','verlegung_pending']))
SELECT count(*) AS alter_weg FROM pg_constraint
WHERE conrelid='public.gutachter_termine'::regclass AND conname='gutachter_termine_no_sv_overlap';  -- 0
```
Expected: neuer Constraint mit assignee-Keys + identischem WHERE; `alter_weg=0`. (Der End-to-End-Block-Beweis folgt in Task 4.)

- [ ] **Step 4: Version ablesen + File committen** — `list_migrations` → `<V3>`. File anlegen, `</content>`-Scan, committen.

---

## Task 4: Live-Verify-Script (Controller) — Doppelbuchung blockt end-to-end + Non-Regression

**Files:** Create `scripts/verify-engine-p2-2-constraint.mts`

Beweist gegen die echte DB: **(A)** zwei überlappende `kundenbetreuer`-Buchungen → 2. mit `23P01` abgelehnt (assignee-gekeyt, vorher ungeschützt). **(B)** zwei überlappende Buchungen via **Legacy `sv_id`-only** (assignee_id NULL → Normalize füllt → Constraint blockt) → Non-Regression. **(C)** nicht-überlappende Buchung → akzeptiert (kein Über-Blocken). **(D)** neue Spalten beschreibbar. Cleanup via `try/finally` (id-Liste + Marker `notiz_intern`).

- [ ] **Step 1: Script schreiben** (Boilerplate `loadEnv` exakt aus `verify-engine-belegung.mts`):

```typescript
// P2.2 Verify: assignee-Exclusion-Constraint blockt Doppelbuchung end-to-end + Non-Regression.
// Run (controller): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-p2-2-constraint.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const db = createAdminClient()
const MARK = 'VERIFY-P2-2'
const ids: string[] = []

// Jahr 2099 → kollidiert mit keiner realen Buchung.
const W_A = '2099-03-01T09:00:00Z', W_B = '2099-03-01T11:00:00Z'   // Basis-Fenster
const O_A = '2099-03-01T10:00:00Z', O_B = '2099-03-01T12:00:00Z'   // überlappt W
const S_A = '2099-03-01T13:00:00Z', S_B = '2099-03-01T14:00:00Z'   // separat

type Row = Record<string, unknown>
async function ins(row: Row) {
  const r = await db.from('gutachter_termine').insert({ ...row, notiz_intern: MARK }).select('id').single()
  if (r.data?.id) ids.push(r.data.id as string)
  return r
}

let res: Record<string, unknown> = {}
try {
  const { data: kb } = await db.from('profiles').select('id').eq('rolle', 'kundenbetreuer').limit(1).maybeSingle()
  const { data: sv } = await db.from('sachverstaendige').select('id').limit(1).maybeSingle()
  const kbId = kb?.id as string | undefined
  const svId = sv?.id as string | undefined

  // (A) assignee-gekeyt: zwei überlappende KB-Buchungen → 2. abgelehnt. + neue Spalten (D).
  const a1 = await ins({ assignee_typ: 'kundenbetreuer', assignee_id: kbId, typ: 'kb_beratung',
    start_zeit: W_A, end_zeit: W_B, status: 'reserviert', quelle: 'self_service', reserviert_bis: '2099-03-01T09:15:00Z' })
  const a2 = await ins({ assignee_typ: 'kundenbetreuer', assignee_id: kbId, typ: 'kb_beratung',
    start_zeit: O_A, end_zeit: O_B, status: 'reserviert' })
  const assignee_double_blocked = a2.error?.code === '23P01'

  // (C) Non-Overlap akzeptiert + bezug-Paar beschreibbar.
  const a3 = await ins({ assignee_typ: 'kundenbetreuer', assignee_id: kbId, typ: 'kb_beratung',
    start_zeit: S_A, end_zeit: S_B, status: 'reserviert', bezug_typ: 'lead', bezug_id: '00000000-0000-0000-0000-0000000000aa' })
  const nonoverlap_ok = !a3.error && !!a3.data?.id

  // (B) Legacy-Pfad: sv_id-only (assignee_id NULL) → Normalize → Constraint blockt Overlap.
  const l1 = await ins({ sv_id: svId, typ: 'sv_begutachtung', start_zeit: W_A, end_zeit: W_B, status: 'bestaetigt' })
  const l2 = await ins({ sv_id: svId, typ: 'sv_begutachtung', start_zeit: O_A, end_zeit: O_B, status: 'bestaetigt' })
  const legacy_double_blocked = l2.error?.code === '23P01'

  // Normalize hat assignee auf l1 gefüllt? + neue Spalten auf a1 lesbar?
  const { data: l1row } = await db.from('gutachter_termine').select('assignee_typ, assignee_id').eq('id', l1.data?.id ?? '').maybeSingle()
  const normalize_ok = l1row?.assignee_typ === 'sachverstaendiger' && l1row?.assignee_id === svId
  const { data: a1row } = await db.from('gutachter_termine').select('quelle, reserviert_bis').eq('id', a1.data?.id ?? '').maybeSingle()
  const columns_ok = a1row?.quelle === 'self_service' && a1row?.reserviert_bis != null

  res = {
    kbId, svId, assignee_double_blocked, nonoverlap_ok, legacy_double_blocked, normalize_ok, columns_ok,
    VERDICT: assignee_double_blocked && nonoverlap_ok && legacy_double_blocked && normalize_ok && columns_ok ? 'GRUEN' : 'FEHLER',
  }
} finally {
  if (ids.length) await db.from('gutachter_termine').delete().in('id', ids)
  await db.from('gutachter_termine').delete().eq('notiz_intern', MARK) // Gürtel + Hosenträger
}
console.log(JSON.stringify(res, null, 2))
```

- [ ] **Step 2: Ausführen (Controller)** — `cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-p2-2-constraint.mts && rm -f .env.local` → erwartet `VERDICT: GRUEN`. (`</content>`-Scan des Scripts.)

- [ ] **Step 3: Commit.**

---

## Task 5: Build-Gate + PR

- [ ] **Step 1:** `cd "<WT>" && npx tsc --noEmit` → PASS (P2.2 ändert keinen TS-Code außer dem Verify-Script; `next build` OOMt im Worktree → `tsc`).
- [ ] **Step 2:** Typen-Regen bleibt aufgeschoben (kein Consumer der neuen Spalten vor P2.3).
- [ ] **Step 3:** `git status` clean (keine Stray-Files), `git stash list` leer (Regel 3). `git push -u origin kitta/termin-engine-p2-2` + `gh pr create --base staging` (Body: 7-Punkt-Audit + Verify-VERDICT + die drei Migrationen + **expliziter Hinweis auf Task-3-Constraint-Swap + Aaron-Go-Status**).
- [ ] **Step 4:** Post-Merge: `verify-engine-p2-2-constraint.mts` gegen staging als Landungs-Beweis.

---

## Self-Review

**Spec-Coverage (Handoff §2 P2.2 + Design §4a/§7):**
- `quelle`/`bezug_typ`/`bezug_id`/`reserviert_bis` additiv ✓ (Task 1). `reserviert_bis` = TTL-Ziel für P2.3 ✓.
- Exclusion-Constraint von `sv_id` auf `(assignee_typ, assignee_id)` ✓ (Task 3); btree_gist im `extensions`-Schema qualifiziert ✓; Vorab-Check (0 aktive ohne assignee, 0 Overlaps) ✓ (Task 3 Step 1); ~19 Zeilen → instant Lock ✓.
- **Über die Spec hinaus (begründet):** Normalisierungs-Trigger (Task 2) — der Live-Writer-Audit zeigte, dass der Swap ohne ihn **regressiv** wäre (kein Writer setzt assignee → neue Buchungen ungeschützt). Schließt zugleich die heute offene KB/sv_lead-Lücke. **Aaron-Review-Punkt:** falls stattdessen die COALESCE-Ausdruck-Variante (kein Trigger) gewünscht ist, siehe Design-Entscheidung #5.

**Placeholder-Scan:** keine TBD; alle DDL/Verify vollständig. `<V1..3>`/`<WT>`/`<main>` sind bewusste Laufzeit-Platzhalter (getrackte Version / Worktree-Pfad / Main-Checkout für `.env.local`), wie in P2.1a/b.

**Typ-Konsistenz:** `bezug_typ`-Werte `claim/fall/lead` == `v_belegung`-CASE == `engine/types.ts:BezugTyp`. Constraint-Name neu `gutachter_termine_no_assignee_overlap` (alt `…_no_sv_overlap`) — kein Caller fängt den Namen ab (Grep). Trigger-Name `trg_gutachter_termine_normalize_assignee` sortiert vor `…_validate_assignee` (verifiziert). WHERE-Status-Set in Constraint == Backfill-Aktiv-Set == v_belegung-Aktiv-Set (`bestaetigt/reserviert/verlegt/verlegung_pending`).

**Risiko:** Task 1+2 additiv/low-risk (neue Spalten/Trigger, 0 Consumer, v_belegung unberührt). Task 3 = einziges Hochrisiko: atomarer DROP+ADD (Rollback-sicher), Live-Recheck + Aaron-Go davor. `v_belegung` braucht **kein** `CREATE OR REPLACE` → kein Security-Re-Lock-Risiko. Edge-Case Normalize: ein UPDATE, das `sv_id` auf NULL setzt ohne `assignee_id` zu berühren, lässt `assignee_id` stale — kein heutiger Writer tut das (Audit); dokumentiert, Phase-3-Härtung (assignee NOT NULL) räumt es endgültig.

---

## Roadmap (danach)
- **P2.3 — Writes (State-Machine) + GEOCODING-GARANTIE (Produkt-Kern):** `reserviere`/`bestaetige`/`sageAb`/`verlege` als eine State-Machine; `bestaetige` resolved + geocodet das Vor-Ort-Ziel auf `besichtigungsort_lat/lng` (Remote `kanal IN (video,telefon)` ausgenommen) — **ohne geocodebares Ziel kein `bestätigt`**. **Prerequisite:** fail-closed `pruefeBelegung`-Variante (Result-Object) vor dem Buchungs-Gate (JSDoc-Warnung steht). Reservierungs-TTL-Cleanup zentral (nutzt `reserviert_bis`). `typ:'vor_ort'`-Discrepancy in `onboarding/slots.ts` klären (Live-CHECK erlaubt nur `sv_begutachtung/kb_beratung/konfrontation`). CMM-73-Daten-Fix (`bestaetige` legt `auftraege.erstgutachten` an) — `v_claim_phase` ist geteilte Kern-View → mit CMM-50/69/72 abstimmen.
- **P2.4** `findeBestePerson` + Org-Dedup · **P2.5** `syncTerminToExternalCalendar` · **Phase 3** Consumer-Migration (Repoint auf die Engine, `cache-busy.ts`→`v_belegung`, `freieSlots`-Repoint mit den Parity-Flags, dann `sv_id`/`lead_id`-Kompat droppen + Normalize-Trigger entfernen).
