# Cluster F+G PR-1 — Schema + View + Dual-Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitert `gutachten`-Tabelle um 38 Daten-Spalten, legt View `v_gutachten_werte` + Postgres-Function `apply_gutachten_ocr` als atomic Dual-Write-Layer an, stellt 4 OCR-Writer-Stellen auf die Function um. Output: `claims` + `gutachten` halten dieselben OCR-Werte konsistent; PR-2 (folgt nach Merge) stellt 25 Reader auf View um und droppt die claims-Spalten.

**Architecture:** Phased mit View statt Big Bang. PR-1 fügt Daten-Quellen zur leeren `gutachten`-Tabelle dazu (1:1-Multiplicity per UNIQUE-Constraint), Backfill kopiert OCR-fertige Claims, View `v_gutachten_werte` joint claims×gutachten mit COALESCE (Dual-Source-Reads für die Übergangsphase). Postgres-Function `apply_gutachten_ocr(claim_id, jsonb)` schreibt in einer Transaction sowohl `claims.*` als auch `gutachten.*` — atomic Dual-Write, kein Application-Layer-Risiko.

**Tech Stack:** Postgres 15+ (CHECK-Constraints, UNIQUE, ON CONFLICT, security_invoker views, plpgsql SECURITY DEFINER functions), Supabase CLI v2.98 für Migrations + Type-Gen, TypeScript (Anthropic SDK in OCR-Pipeline), Next.js 16 Server-Actions.

**Branch:** `kitta/aar-cluster-fg-gutachten` (von `origin/main`, Spec bereits committed als `0c276197`).

**Spec:** `docs/superpowers/specs/2026-05-14-cluster-fg-gutachten-subtable-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/<ts>_aar_cluster_fg_gutachten_schema.sql` — Migration A: Spalten + CHECK + UNIQUE + Backfill + View + Function

**Modify:**
- `src/lib/ai/gutachten-ocr.ts:178-280` — 3 Writer-Stellen auf RPC-Call zur Function
- `src/app/faelle/[id]/_actions/gutachten-ocr.ts:84-110` — manueller Admin-Edit-Writer auf RPC-Call
- `src/lib/supabase/database.types.ts` — komplett regeneriert via `supabase gen types`

**Test (kein dedicated unit-test-suite vorhanden für OCR, wir verifizieren über manuellen Smoke):**
- `docs/14.05.2026/cluster-fg-pr1-smoke/smoke-ocr-dual-write.mjs` — Playwright/Node-Skript das OCR-Re-Run auf einem Test-Claim auslöst und Werte in beiden Tabellen vergleicht

---

### Task 1: Migration-File anlegen + Header

**Files:**
- Create: `supabase/migrations/<auto-ts>_aar_cluster_fg_gutachten_schema.sql`

- [ ] **Step 1: Migration-Skeleton anlegen**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/aar-session-koord-13-05" && npx supabase migration new aar_cluster_fg_gutachten_schema
```

Expected output: `Created new migration at supabase/migrations/<timestamp>_aar_cluster_fg_gutachten_schema.sql`

- [ ] **Step 2: Migration-Header schreiben**

```sql
-- AAR Cluster F+G (Gutachten Sub-Table, 14.05.2026 PR-1)
-- Spec: docs/superpowers/specs/2026-05-14-cluster-fg-gutachten-subtable-design.md
--
-- Phase 1 (dieser PR): Schema + View + Dual-Write-Function aufbauen.
-- 38 Daten-Spalten von claims auf gutachten spiegeln (1:1 via UNIQUE),
-- View v_gutachten_werte mit COALESCE als Dual-Source-Reader, Function
-- apply_gutachten_ocr() schreibt atomic auf claims+gutachten.
--
-- Phase 2 (PR-2 nach Merge): 25 Reader auf View umstellen, claims-Spalten
-- droppen, Dual-Write aus Function entfernen.

BEGIN;
```

Append am Ende des Files: `COMMIT;`

---

### Task 2: 38 Daten-Spalten + 3 CHECK-Constraints auf gutachten

**Files:**
- Modify: `supabase/migrations/<ts>_aar_cluster_fg_gutachten_schema.sql` (zwischen `BEGIN;` und `COMMIT;`)

- [ ] **Step 1: ALTER TABLE ADD COLUMN block**

```sql
-- ─────────────────────────────────────────────────────────────────────
-- Cluster F (30 Spalten): OCR-Output + Pipeline-Meta
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.gutachten
  ADD COLUMN IF NOT EXISTS gutachten_datum                date,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_processed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_raw              jsonb,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_error            text,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_manuell_ueberschrieben boolean NOT NULL DEFAULT false,
  -- Cluster F.A — Fahrzeug-Stammdaten aus PDF
  ADD COLUMN IF NOT EXISTS gutachten_fin                  text,
  ADD COLUMN IF NOT EXISTS gutachten_kennzeichen          text,
  ADD COLUMN IF NOT EXISTS gutachten_erstzulassung        date,
  ADD COLUMN IF NOT EXISTS gutachten_laufleistung_km      integer,
  ADD COLUMN IF NOT EXISTS gutachten_tuv_bis              date,
  ADD COLUMN IF NOT EXISTS gutachten_fahrzeug_typ         text,
  ADD COLUMN IF NOT EXISTS gutachten_farbe                text,
  ADD COLUMN IF NOT EXISTS gutachten_farbcode             text,
  ADD COLUMN IF NOT EXISTS gutachten_kraftstoff           text,
  -- Cluster F.B — Vorschäden + Zustand
  ADD COLUMN IF NOT EXISTS gutachten_vorschaeden_text     text,
  ADD COLUMN IF NOT EXISTS gutachten_lackmesswert_max_my  numeric(6, 1),
  ADD COLUMN IF NOT EXISTS gutachten_karosseriezustand    text,
  -- Cluster F.C — Reparatur-Detail
  ADD COLUMN IF NOT EXISTS gutachten_zeit_ak_std          numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_zeit_kar_std         numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_zeit_lack_std        numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_ak_eur      numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_kar_eur     numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_lack_eur    numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_materialkosten_eur   numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lackmaterial_eur     numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_verbringung_eur      numeric(10, 2),
  -- Cluster F.D — Mietwagen + Nutzungsausfall (Tagessätze)
  ADD COLUMN IF NOT EXISTS gutachten_mietwagen_klasse              text,
  ADD COLUMN IF NOT EXISTS gutachten_mietwagen_tagessatz_eur       numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_nutzungsausfall_tagessatz_eur numeric(8, 2),
  -- Cluster F.E — SV-Metadaten
  ADD COLUMN IF NOT EXISTS gutachten_sv_honorar_netto     numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_sv_honorar_brutto    numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_kalkulationssystem   text,
  ADD COLUMN IF NOT EXISTS gutachten_seitenzahl           integer,
  -- ─────────────────────────────────────────────────────────────────────
  -- Cluster G (8 Spalten): Wert-Output (Kunde-/SV-facing)
  -- ─────────────────────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS reparaturkosten_netto          numeric(10, 2),
  ADD COLUMN IF NOT EXISTS reparaturkosten_brutto         numeric(10, 2),
  ADD COLUMN IF NOT EXISTS minderwert                     numeric(10, 2),
  ADD COLUMN IF NOT EXISTS restwert                       numeric(10, 2),
  ADD COLUMN IF NOT EXISTS wiederbeschaffungswert         numeric(10, 2),
  ADD COLUMN IF NOT EXISTS wiederbeschaffungsdauer_tage   integer,
  ADD COLUMN IF NOT EXISTS nutzungsausfall_tage           integer,
  ADD COLUMN IF NOT EXISTS totalschaden                   boolean;

-- CHECK-Constraints 1:1 von claims uebernommen
-- (Migration 20260502104809 hatte diese drei)
ALTER TABLE public.gutachten
  DROP CONSTRAINT IF EXISTS gutachten_karosseriezustand_check;
ALTER TABLE public.gutachten
  ADD CONSTRAINT gutachten_karosseriezustand_check CHECK (
    gutachten_karosseriezustand IS NULL
    OR gutachten_karosseriezustand IN ('makellos', 'gebrauchsspuren', 'unfallbeschaedigt', 'sonstiges')
  );

ALTER TABLE public.gutachten
  DROP CONSTRAINT IF EXISTS gutachten_kalkulationssystem_check;
ALTER TABLE public.gutachten
  ADD CONSTRAINT gutachten_kalkulationssystem_check CHECK (
    gutachten_kalkulationssystem IS NULL
    OR gutachten_kalkulationssystem IN ('audatex', 'dat', 'autoixpert', 'sonstiges')
  );

ALTER TABLE public.gutachten
  DROP CONSTRAINT IF EXISTS gutachten_kraftstoff_check;
ALTER TABLE public.gutachten
  ADD CONSTRAINT gutachten_kraftstoff_check CHECK (
    gutachten_kraftstoff IS NULL
    OR gutachten_kraftstoff IN ('benzin', 'diesel', 'hybrid', 'elektro', 'gas', 'sonstiges')
  );
```

---

### Task 3: UNIQUE-Constraint auf gutachten.claim_id

**Files:**
- Modify: same migration file

- [ ] **Step 1: UNIQUE-Constraint (1:1-Garantie für ON CONFLICT)**

```sql
-- 1:1-Garantie. gutachten heute: nur Index idx_gutachten_claim (Migration
-- 20260426140000 Zeile 42), kein UNIQUE. Brauchen wir fuer ON CONFLICT in
-- apply_gutachten_ocr (Task 5). Drop des redundanten Index, weil UNIQUE
-- implizit einen Btree-Index erzeugt.
ALTER TABLE public.gutachten
  DROP CONSTRAINT IF EXISTS gutachten_claim_id_unique;
ALTER TABLE public.gutachten
  ADD CONSTRAINT gutachten_claim_id_unique UNIQUE (claim_id);

DROP INDEX IF EXISTS public.idx_gutachten_claim;
```

---

### Task 4: Backfill bestehender OCR-Claims

**Files:**
- Modify: same migration file

- [ ] **Step 1: Pre-Check fuer 1:N-Verletzungen (sollte 0 sein)**

```sql
-- Pre-Check: Wenn gutachten doch schon Daten haette mit mehr als 1 Row pro
-- claim_id, wuerde der UNIQUE-Constraint oben failen. Audit sagt 0 Rows;
-- dieser DO-Block macht das explizit.
DO $$
DECLARE v_dupe_count integer;
BEGIN
  SELECT count(*) INTO v_dupe_count FROM (
    SELECT claim_id FROM public.gutachten GROUP BY claim_id HAVING count(*) > 1
  ) sub;
  IF v_dupe_count > 0 THEN
    RAISE EXCEPTION 'gutachten hat % claim_id-Duplikate — Backfill abgebrochen', v_dupe_count;
  END IF;
END $$;
```

- [ ] **Step 2: Backfill INSERT**

```sql
-- Fuer jeden Claim mit OCR-Output + zugeordnetem SV eine gutachten-Row
-- anlegen. status='final' weil gutachten_ocr_processed_at gesetzt = Pipeline
-- ist durchgelaufen. Skipt Claims die schon eine gutachten-Row haben.
INSERT INTO public.gutachten (
  claim_id, sv_id, status, fertiggestellt_am,
  -- Cluster F
  gutachten_datum, gutachten_ocr_processed_at, gutachten_ocr_raw,
  gutachten_ocr_error, gutachten_ocr_manuell_ueberschrieben,
  gutachten_fin, gutachten_kennzeichen, gutachten_erstzulassung,
  gutachten_laufleistung_km, gutachten_tuv_bis, gutachten_fahrzeug_typ,
  gutachten_farbe, gutachten_farbcode, gutachten_kraftstoff,
  gutachten_vorschaeden_text, gutachten_lackmesswert_max_my,
  gutachten_karosseriezustand,
  gutachten_zeit_ak_std, gutachten_zeit_kar_std, gutachten_zeit_lack_std,
  gutachten_lohnsatz_ak_eur, gutachten_lohnsatz_kar_eur, gutachten_lohnsatz_lack_eur,
  gutachten_materialkosten_eur, gutachten_lackmaterial_eur, gutachten_verbringung_eur,
  gutachten_mietwagen_klasse, gutachten_mietwagen_tagessatz_eur,
  gutachten_nutzungsausfall_tagessatz_eur,
  gutachten_sv_honorar_netto, gutachten_sv_honorar_brutto,
  gutachten_kalkulationssystem, gutachten_seitenzahl,
  -- Cluster G
  reparaturkosten_netto, reparaturkosten_brutto, minderwert, restwert,
  wiederbeschaffungswert, wiederbeschaffungsdauer_tage,
  nutzungsausfall_tage, totalschaden
)
SELECT
  c.id, f.sv_id, 'final', c.gutachten_ocr_processed_at,
  c.gutachten_datum, c.gutachten_ocr_processed_at, c.gutachten_ocr_raw,
  c.gutachten_ocr_error, COALESCE(c.gutachten_ocr_manuell_ueberschrieben, false),
  c.gutachten_fin, c.gutachten_kennzeichen, c.gutachten_erstzulassung,
  c.gutachten_laufleistung_km, c.gutachten_tuv_bis, c.gutachten_fahrzeug_typ,
  c.gutachten_farbe, c.gutachten_farbcode, c.gutachten_kraftstoff,
  c.gutachten_vorschaeden_text, c.gutachten_lackmesswert_max_my,
  c.gutachten_karosseriezustand,
  c.gutachten_zeit_ak_std, c.gutachten_zeit_kar_std, c.gutachten_zeit_lack_std,
  c.gutachten_lohnsatz_ak_eur, c.gutachten_lohnsatz_kar_eur, c.gutachten_lohnsatz_lack_eur,
  c.gutachten_materialkosten_eur, c.gutachten_lackmaterial_eur, c.gutachten_verbringung_eur,
  c.gutachten_mietwagen_klasse, c.gutachten_mietwagen_tagessatz_eur,
  c.gutachten_nutzungsausfall_tagessatz_eur,
  c.gutachten_sv_honorar_netto, c.gutachten_sv_honorar_brutto,
  c.gutachten_kalkulationssystem, c.gutachten_seitenzahl,
  c.reparaturkosten_netto, c.reparaturkosten_brutto, c.minderwert, c.restwert,
  c.wiederbeschaffungswert, c.wiederbeschaffungsdauer_tage,
  c.nutzungsausfall_tage, c.totalschaden
FROM public.claims c
JOIN public.faelle f ON f.claim_id = c.id
WHERE c.gutachten_ocr_processed_at IS NOT NULL
  AND f.sv_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gutachten g WHERE g.claim_id = c.id);
```

---

### Task 5: Postgres-Function apply_gutachten_ocr (Atomic Dual-Write)

**Files:**
- Modify: same migration file

- [ ] **Step 1: Function definieren**

```sql
-- apply_gutachten_ocr — schreibt atomic auf claims + gutachten in einer TX.
-- Aufruf-Pattern aus dem Application-Layer:
--   await admin.rpc('apply_gutachten_ocr', { p_claim_id: id, p_values: {...} })
--
-- p_values: jsonb-Map ColumnName → Wert. Alle 38 Spalten + die 5 Meta-Felder
-- (processed_at/raw/error/manuell_ueberschrieben/datum).
--
-- SECURITY DEFINER weil von OCR-Pipeline mit anon-Bezugskontext aufgerufen
-- werden kann; search_path explizit gesetzt (Security-Pflicht aus
-- supabase:supabase-Skill).
CREATE OR REPLACE FUNCTION public.apply_gutachten_ocr(
  p_claim_id uuid,
  p_values   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sv_id uuid;
BEGIN
  -- 1) claims-Tabelle: Update mit dynamic jsonb-zu-columns
  UPDATE public.claims SET
    gutachten_datum                     = COALESCE((p_values->>'gutachten_datum')::date, gutachten_datum),
    gutachten_ocr_processed_at          = COALESCE((p_values->>'gutachten_ocr_processed_at')::timestamptz, gutachten_ocr_processed_at),
    gutachten_ocr_raw                   = COALESCE(p_values->'gutachten_ocr_raw', gutachten_ocr_raw),
    gutachten_ocr_error                 = NULLIF(p_values->>'gutachten_ocr_error', ''),
    gutachten_ocr_manuell_ueberschrieben = COALESCE((p_values->>'gutachten_ocr_manuell_ueberschrieben')::boolean, gutachten_ocr_manuell_ueberschrieben),
    gutachten_fin                       = COALESCE(p_values->>'gutachten_fin', gutachten_fin),
    gutachten_kennzeichen               = COALESCE(p_values->>'gutachten_kennzeichen', gutachten_kennzeichen),
    gutachten_erstzulassung             = COALESCE((p_values->>'gutachten_erstzulassung')::date, gutachten_erstzulassung),
    gutachten_laufleistung_km           = COALESCE((p_values->>'gutachten_laufleistung_km')::integer, gutachten_laufleistung_km),
    gutachten_tuv_bis                   = COALESCE((p_values->>'gutachten_tuv_bis')::date, gutachten_tuv_bis),
    gutachten_fahrzeug_typ              = COALESCE(p_values->>'gutachten_fahrzeug_typ', gutachten_fahrzeug_typ),
    gutachten_farbe                     = COALESCE(p_values->>'gutachten_farbe', gutachten_farbe),
    gutachten_farbcode                  = COALESCE(p_values->>'gutachten_farbcode', gutachten_farbcode),
    gutachten_kraftstoff                = COALESCE(p_values->>'gutachten_kraftstoff', gutachten_kraftstoff),
    gutachten_vorschaeden_text          = COALESCE(p_values->>'gutachten_vorschaeden_text', gutachten_vorschaeden_text),
    gutachten_lackmesswert_max_my       = COALESCE((p_values->>'gutachten_lackmesswert_max_my')::numeric, gutachten_lackmesswert_max_my),
    gutachten_karosseriezustand         = COALESCE(p_values->>'gutachten_karosseriezustand', gutachten_karosseriezustand),
    gutachten_zeit_ak_std               = COALESCE((p_values->>'gutachten_zeit_ak_std')::numeric, gutachten_zeit_ak_std),
    gutachten_zeit_kar_std              = COALESCE((p_values->>'gutachten_zeit_kar_std')::numeric, gutachten_zeit_kar_std),
    gutachten_zeit_lack_std             = COALESCE((p_values->>'gutachten_zeit_lack_std')::numeric, gutachten_zeit_lack_std),
    gutachten_lohnsatz_ak_eur           = COALESCE((p_values->>'gutachten_lohnsatz_ak_eur')::numeric, gutachten_lohnsatz_ak_eur),
    gutachten_lohnsatz_kar_eur          = COALESCE((p_values->>'gutachten_lohnsatz_kar_eur')::numeric, gutachten_lohnsatz_kar_eur),
    gutachten_lohnsatz_lack_eur         = COALESCE((p_values->>'gutachten_lohnsatz_lack_eur')::numeric, gutachten_lohnsatz_lack_eur),
    gutachten_materialkosten_eur        = COALESCE((p_values->>'gutachten_materialkosten_eur')::numeric, gutachten_materialkosten_eur),
    gutachten_lackmaterial_eur          = COALESCE((p_values->>'gutachten_lackmaterial_eur')::numeric, gutachten_lackmaterial_eur),
    gutachten_verbringung_eur           = COALESCE((p_values->>'gutachten_verbringung_eur')::numeric, gutachten_verbringung_eur),
    gutachten_mietwagen_klasse          = COALESCE(p_values->>'gutachten_mietwagen_klasse', gutachten_mietwagen_klasse),
    gutachten_mietwagen_tagessatz_eur   = COALESCE((p_values->>'gutachten_mietwagen_tagessatz_eur')::numeric, gutachten_mietwagen_tagessatz_eur),
    gutachten_nutzungsausfall_tagessatz_eur = COALESCE((p_values->>'gutachten_nutzungsausfall_tagessatz_eur')::numeric, gutachten_nutzungsausfall_tagessatz_eur),
    gutachten_sv_honorar_netto          = COALESCE((p_values->>'gutachten_sv_honorar_netto')::numeric, gutachten_sv_honorar_netto),
    gutachten_sv_honorar_brutto         = COALESCE((p_values->>'gutachten_sv_honorar_brutto')::numeric, gutachten_sv_honorar_brutto),
    gutachten_kalkulationssystem        = COALESCE(p_values->>'gutachten_kalkulationssystem', gutachten_kalkulationssystem),
    gutachten_seitenzahl                = COALESCE((p_values->>'gutachten_seitenzahl')::integer, gutachten_seitenzahl),
    reparaturkosten_netto               = COALESCE((p_values->>'reparaturkosten_netto')::numeric, reparaturkosten_netto),
    reparaturkosten_brutto              = COALESCE((p_values->>'reparaturkosten_brutto')::numeric, reparaturkosten_brutto),
    minderwert                          = COALESCE((p_values->>'minderwert')::numeric, minderwert),
    restwert                            = COALESCE((p_values->>'restwert')::numeric, restwert),
    wiederbeschaffungswert              = COALESCE((p_values->>'wiederbeschaffungswert')::numeric, wiederbeschaffungswert),
    wiederbeschaffungsdauer_tage        = COALESCE((p_values->>'wiederbeschaffungsdauer_tage')::integer, wiederbeschaffungsdauer_tage),
    nutzungsausfall_tage                = COALESCE((p_values->>'nutzungsausfall_tage')::integer, nutzungsausfall_tage),
    totalschaden                        = COALESCE((p_values->>'totalschaden')::boolean, totalschaden)
  WHERE id = p_claim_id;

  -- 2) gutachten-Tabelle: Upsert (INSERT mit ON CONFLICT auf claim_id-UNIQUE)
  -- Brauchen sv_id fuer NOT-NULL-Constraint — aus faelle.sv_id holen.
  SELECT f.sv_id INTO v_sv_id FROM public.faelle f WHERE f.claim_id = p_claim_id;

  -- Wenn kein SV zugeordnet: kein gutachten-Row anlegen. View liefert dann
  -- via COALESCE die claims-Werte als Fallback — kein Datenverlust.
  IF v_sv_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.gutachten (
    claim_id, sv_id, status,
    gutachten_datum, gutachten_ocr_processed_at, gutachten_ocr_raw,
    gutachten_ocr_error, gutachten_ocr_manuell_ueberschrieben,
    gutachten_fin, gutachten_kennzeichen, gutachten_erstzulassung,
    gutachten_laufleistung_km, gutachten_tuv_bis, gutachten_fahrzeug_typ,
    gutachten_farbe, gutachten_farbcode, gutachten_kraftstoff,
    gutachten_vorschaeden_text, gutachten_lackmesswert_max_my,
    gutachten_karosseriezustand,
    gutachten_zeit_ak_std, gutachten_zeit_kar_std, gutachten_zeit_lack_std,
    gutachten_lohnsatz_ak_eur, gutachten_lohnsatz_kar_eur, gutachten_lohnsatz_lack_eur,
    gutachten_materialkosten_eur, gutachten_lackmaterial_eur, gutachten_verbringung_eur,
    gutachten_mietwagen_klasse, gutachten_mietwagen_tagessatz_eur,
    gutachten_nutzungsausfall_tagessatz_eur,
    gutachten_sv_honorar_netto, gutachten_sv_honorar_brutto,
    gutachten_kalkulationssystem, gutachten_seitenzahl,
    reparaturkosten_netto, reparaturkosten_brutto, minderwert, restwert,
    wiederbeschaffungswert, wiederbeschaffungsdauer_tage,
    nutzungsausfall_tage, totalschaden
  )
  SELECT p_claim_id, v_sv_id, 'final',
    c.gutachten_datum, c.gutachten_ocr_processed_at, c.gutachten_ocr_raw,
    c.gutachten_ocr_error, c.gutachten_ocr_manuell_ueberschrieben,
    c.gutachten_fin, c.gutachten_kennzeichen, c.gutachten_erstzulassung,
    c.gutachten_laufleistung_km, c.gutachten_tuv_bis, c.gutachten_fahrzeug_typ,
    c.gutachten_farbe, c.gutachten_farbcode, c.gutachten_kraftstoff,
    c.gutachten_vorschaeden_text, c.gutachten_lackmesswert_max_my,
    c.gutachten_karosseriezustand,
    c.gutachten_zeit_ak_std, c.gutachten_zeit_kar_std, c.gutachten_zeit_lack_std,
    c.gutachten_lohnsatz_ak_eur, c.gutachten_lohnsatz_kar_eur, c.gutachten_lohnsatz_lack_eur,
    c.gutachten_materialkosten_eur, c.gutachten_lackmaterial_eur, c.gutachten_verbringung_eur,
    c.gutachten_mietwagen_klasse, c.gutachten_mietwagen_tagessatz_eur,
    c.gutachten_nutzungsausfall_tagessatz_eur,
    c.gutachten_sv_honorar_netto, c.gutachten_sv_honorar_brutto,
    c.gutachten_kalkulationssystem, c.gutachten_seitenzahl,
    c.reparaturkosten_netto, c.reparaturkosten_brutto, c.minderwert, c.restwert,
    c.wiederbeschaffungswert, c.wiederbeschaffungsdauer_tage,
    c.nutzungsausfall_tage, c.totalschaden
  FROM public.claims c WHERE c.id = p_claim_id
  ON CONFLICT (claim_id) DO UPDATE SET
    gutachten_datum                     = EXCLUDED.gutachten_datum,
    gutachten_ocr_processed_at          = EXCLUDED.gutachten_ocr_processed_at,
    gutachten_ocr_raw                   = EXCLUDED.gutachten_ocr_raw,
    gutachten_ocr_error                 = EXCLUDED.gutachten_ocr_error,
    gutachten_ocr_manuell_ueberschrieben = EXCLUDED.gutachten_ocr_manuell_ueberschrieben,
    gutachten_fin                       = EXCLUDED.gutachten_fin,
    gutachten_kennzeichen               = EXCLUDED.gutachten_kennzeichen,
    gutachten_erstzulassung             = EXCLUDED.gutachten_erstzulassung,
    gutachten_laufleistung_km           = EXCLUDED.gutachten_laufleistung_km,
    gutachten_tuv_bis                   = EXCLUDED.gutachten_tuv_bis,
    gutachten_fahrzeug_typ              = EXCLUDED.gutachten_fahrzeug_typ,
    gutachten_farbe                     = EXCLUDED.gutachten_farbe,
    gutachten_farbcode                  = EXCLUDED.gutachten_farbcode,
    gutachten_kraftstoff                = EXCLUDED.gutachten_kraftstoff,
    gutachten_vorschaeden_text          = EXCLUDED.gutachten_vorschaeden_text,
    gutachten_lackmesswert_max_my       = EXCLUDED.gutachten_lackmesswert_max_my,
    gutachten_karosseriezustand         = EXCLUDED.gutachten_karosseriezustand,
    gutachten_zeit_ak_std               = EXCLUDED.gutachten_zeit_ak_std,
    gutachten_zeit_kar_std              = EXCLUDED.gutachten_zeit_kar_std,
    gutachten_zeit_lack_std             = EXCLUDED.gutachten_zeit_lack_std,
    gutachten_lohnsatz_ak_eur           = EXCLUDED.gutachten_lohnsatz_ak_eur,
    gutachten_lohnsatz_kar_eur          = EXCLUDED.gutachten_lohnsatz_kar_eur,
    gutachten_lohnsatz_lack_eur         = EXCLUDED.gutachten_lohnsatz_lack_eur,
    gutachten_materialkosten_eur        = EXCLUDED.gutachten_materialkosten_eur,
    gutachten_lackmaterial_eur          = EXCLUDED.gutachten_lackmaterial_eur,
    gutachten_verbringung_eur           = EXCLUDED.gutachten_verbringung_eur,
    gutachten_mietwagen_klasse          = EXCLUDED.gutachten_mietwagen_klasse,
    gutachten_mietwagen_tagessatz_eur   = EXCLUDED.gutachten_mietwagen_tagessatz_eur,
    gutachten_nutzungsausfall_tagessatz_eur = EXCLUDED.gutachten_nutzungsausfall_tagessatz_eur,
    gutachten_sv_honorar_netto          = EXCLUDED.gutachten_sv_honorar_netto,
    gutachten_sv_honorar_brutto         = EXCLUDED.gutachten_sv_honorar_brutto,
    gutachten_kalkulationssystem        = EXCLUDED.gutachten_kalkulationssystem,
    gutachten_seitenzahl                = EXCLUDED.gutachten_seitenzahl,
    reparaturkosten_netto               = EXCLUDED.reparaturkosten_netto,
    reparaturkosten_brutto              = EXCLUDED.reparaturkosten_brutto,
    minderwert                          = EXCLUDED.minderwert,
    restwert                            = EXCLUDED.restwert,
    wiederbeschaffungswert              = EXCLUDED.wiederbeschaffungswert,
    wiederbeschaffungsdauer_tage        = EXCLUDED.wiederbeschaffungsdauer_tage,
    nutzungsausfall_tage                = EXCLUDED.nutzungsausfall_tage,
    totalschaden                        = EXCLUDED.totalschaden;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_gutachten_ocr(uuid, jsonb) TO authenticated;
-- service_role hat per Default execute, daher kein extra GRANT noetig

COMMENT ON FUNCTION public.apply_gutachten_ocr IS
  'AAR Cluster F+G PR-1: Atomic Dual-Write OCR-Werte auf claims + gutachten. '
  'p_values = jsonb-Map ColumnName -> Wert. NULL-Values im jsonb fuehren '
  'COALESCE auf bestehende DB-Werte (keine accidental NULL-Overwrites). '
  'Wird in PR-2 zurueck auf gutachten-only umgestellt + claims-Write entfernt.';
```

---

### Task 6: View v_gutachten_werte (Dual-Source mit COALESCE)

**Files:**
- Modify: same migration file

- [ ] **Step 1: View anlegen**

```sql
-- v_gutachten_werte — Reader-Layer fuer alle 38 Werte. In dieser
-- Uebergangsphase mit COALESCE: bevorzugt gutachten-Wert, faellt auf
-- claims-Wert zurueck wenn gutachten-Row noch nicht existiert oder das
-- Feld dort NULL ist. Nach PR-2 (claims-Spalten gedroppt) wird die View
-- ohne COALESCE neu definiert.
--
-- security_invoker=true: View bleibt mit User-Identity-Bezug; bestehende
-- RLS auf claims + gutachten greift weiter (kein Bypass-Risiko).
DROP VIEW IF EXISTS public.v_gutachten_werte;
CREATE VIEW public.v_gutachten_werte
WITH (security_invoker = true)
AS
SELECT
  c.id AS claim_id,
  c.lead_id,
  g.id AS gutachten_id,
  g.sv_id,
  g.status AS gutachten_status,
  -- Cluster F (30 Felder, COALESCE gutachten -> claims)
  COALESCE(g.gutachten_datum, c.gutachten_datum)                         AS gutachten_datum,
  COALESCE(g.gutachten_ocr_processed_at, c.gutachten_ocr_processed_at)   AS gutachten_ocr_processed_at,
  COALESCE(g.gutachten_ocr_raw, c.gutachten_ocr_raw)                     AS gutachten_ocr_raw,
  COALESCE(g.gutachten_ocr_error, c.gutachten_ocr_error)                 AS gutachten_ocr_error,
  COALESCE(g.gutachten_ocr_manuell_ueberschrieben, c.gutachten_ocr_manuell_ueberschrieben) AS gutachten_ocr_manuell_ueberschrieben,
  COALESCE(g.gutachten_fin, c.gutachten_fin)                             AS gutachten_fin,
  COALESCE(g.gutachten_kennzeichen, c.gutachten_kennzeichen)             AS gutachten_kennzeichen,
  COALESCE(g.gutachten_erstzulassung, c.gutachten_erstzulassung)         AS gutachten_erstzulassung,
  COALESCE(g.gutachten_laufleistung_km, c.gutachten_laufleistung_km)     AS gutachten_laufleistung_km,
  COALESCE(g.gutachten_tuv_bis, c.gutachten_tuv_bis)                     AS gutachten_tuv_bis,
  COALESCE(g.gutachten_fahrzeug_typ, c.gutachten_fahrzeug_typ)           AS gutachten_fahrzeug_typ,
  COALESCE(g.gutachten_farbe, c.gutachten_farbe)                         AS gutachten_farbe,
  COALESCE(g.gutachten_farbcode, c.gutachten_farbcode)                   AS gutachten_farbcode,
  COALESCE(g.gutachten_kraftstoff, c.gutachten_kraftstoff)               AS gutachten_kraftstoff,
  COALESCE(g.gutachten_vorschaeden_text, c.gutachten_vorschaeden_text)   AS gutachten_vorschaeden_text,
  COALESCE(g.gutachten_lackmesswert_max_my, c.gutachten_lackmesswert_max_my) AS gutachten_lackmesswert_max_my,
  COALESCE(g.gutachten_karosseriezustand, c.gutachten_karosseriezustand) AS gutachten_karosseriezustand,
  COALESCE(g.gutachten_zeit_ak_std, c.gutachten_zeit_ak_std)             AS gutachten_zeit_ak_std,
  COALESCE(g.gutachten_zeit_kar_std, c.gutachten_zeit_kar_std)           AS gutachten_zeit_kar_std,
  COALESCE(g.gutachten_zeit_lack_std, c.gutachten_zeit_lack_std)         AS gutachten_zeit_lack_std,
  COALESCE(g.gutachten_lohnsatz_ak_eur, c.gutachten_lohnsatz_ak_eur)     AS gutachten_lohnsatz_ak_eur,
  COALESCE(g.gutachten_lohnsatz_kar_eur, c.gutachten_lohnsatz_kar_eur)   AS gutachten_lohnsatz_kar_eur,
  COALESCE(g.gutachten_lohnsatz_lack_eur, c.gutachten_lohnsatz_lack_eur) AS gutachten_lohnsatz_lack_eur,
  COALESCE(g.gutachten_materialkosten_eur, c.gutachten_materialkosten_eur) AS gutachten_materialkosten_eur,
  COALESCE(g.gutachten_lackmaterial_eur, c.gutachten_lackmaterial_eur)   AS gutachten_lackmaterial_eur,
  COALESCE(g.gutachten_verbringung_eur, c.gutachten_verbringung_eur)     AS gutachten_verbringung_eur,
  COALESCE(g.gutachten_mietwagen_klasse, c.gutachten_mietwagen_klasse)   AS gutachten_mietwagen_klasse,
  COALESCE(g.gutachten_mietwagen_tagessatz_eur, c.gutachten_mietwagen_tagessatz_eur) AS gutachten_mietwagen_tagessatz_eur,
  COALESCE(g.gutachten_nutzungsausfall_tagessatz_eur, c.gutachten_nutzungsausfall_tagessatz_eur) AS gutachten_nutzungsausfall_tagessatz_eur,
  COALESCE(g.gutachten_sv_honorar_netto, c.gutachten_sv_honorar_netto)   AS gutachten_sv_honorar_netto,
  COALESCE(g.gutachten_sv_honorar_brutto, c.gutachten_sv_honorar_brutto) AS gutachten_sv_honorar_brutto,
  COALESCE(g.gutachten_kalkulationssystem, c.gutachten_kalkulationssystem) AS gutachten_kalkulationssystem,
  COALESCE(g.gutachten_seitenzahl, c.gutachten_seitenzahl)               AS gutachten_seitenzahl,
  -- Cluster G (8 Felder)
  COALESCE(g.reparaturkosten_netto, c.reparaturkosten_netto)             AS reparaturkosten_netto,
  COALESCE(g.reparaturkosten_brutto, c.reparaturkosten_brutto)           AS reparaturkosten_brutto,
  COALESCE(g.minderwert, c.minderwert)                                   AS minderwert,
  COALESCE(g.restwert, c.restwert)                                       AS restwert,
  COALESCE(g.wiederbeschaffungswert, c.wiederbeschaffungswert)           AS wiederbeschaffungswert,
  COALESCE(g.wiederbeschaffungsdauer_tage, c.wiederbeschaffungsdauer_tage) AS wiederbeschaffungsdauer_tage,
  COALESCE(g.nutzungsausfall_tage, c.nutzungsausfall_tage)               AS nutzungsausfall_tage,
  COALESCE(g.totalschaden, c.totalschaden)                               AS totalschaden
FROM public.claims c
LEFT JOIN public.gutachten g ON g.claim_id = c.id;

GRANT SELECT ON public.v_gutachten_werte TO authenticated;

COMMENT ON VIEW public.v_gutachten_werte IS
  'AAR Cluster F+G PR-1: Dual-Source-Reader (claims + gutachten via COALESCE). '
  'PR-2 stellt 25 Reader auf diese View um. Nach claims-Drop wird die View '
  'ohne COALESCE neu definiert — dann nur noch gutachten-Source.';
```

---

### Task 7: Migration via supabase db push applizieren

**Files:**
- N/A (Remote-DB-Change)

- [ ] **Step 1: db push laufen lassen**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/aar-session-koord-13-05" && echo "y" | npx supabase db push --linked 2>&1 | tail -10
```

Expected output:
```
Applying migration <timestamp>_aar_cluster_fg_gutachten_schema.sql...
Finished supabase db push.
```

Bei Fehler — typischer Modus: Sync-Trigger-Constraint oder UNIQUE-Konflikt. Migration in dem Fall ergänzen analog zum Stufe-0-Final-Pattern (Trigger-Patch BEVOR Constraint-Add).

---

### Task 8: database.types.ts regenerieren + Cleanup

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (komplette Datei)

- [ ] **Step 1: Types regenerieren**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/aar-session-koord-13-05" && npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts 2>&1
```

- [ ] **Step 2: CLI-Banner + claude-code-hint vom File entfernen**

```bash
sed -i '1{/^Initialising login role/d}' src/lib/supabase/database.types.ts
sed -i '/^A new version of Supabase CLI/,$d' src/lib/supabase/database.types.ts
sed -i '/^<claude-code-hint/d' src/lib/supabase/database.types.ts
```

- [ ] **Step 3: tsc verifizieren**

```bash
npx tsc --noEmit 2>&1 | tail -5 && echo "exit=$?"
```

Expected: `exit=0`, kein Output

---

### Task 9: Writer 1 — src/lib/ai/gutachten-ocr.ts auf RPC umstellen

**Files:**
- Modify: `src/lib/ai/gutachten-ocr.ts:178-280`

- [ ] **Step 1: Idempotenz-Check (Zeile 178-182) auf View umstellen**

Aktuell:
```typescript
const { data: existing } = await admin
  .from('claims')
  .select('gutachten_ocr_processed_at, gutachten_ocr_manuell_ueberschrieben')
  .eq('id', claimId)
  .maybeSingle()
```

Ändern zu:
```typescript
const { data: existing } = await admin
  .from('v_gutachten_werte')
  .select('gutachten_ocr_processed_at, gutachten_ocr_manuell_ueberschrieben')
  .eq('claim_id', claimId)
  .maybeSingle()
```

- [ ] **Step 2: Bestehende-Werte-Read (Zeile 193-197) auf View umstellen**

Aktuell:
```typescript
const { data } = await admin
  .from('claims')
  .select(dbCols)
  .eq('id', claimId)
  .maybeSingle()
```

Ändern zu:
```typescript
const { data } = await admin
  .from('v_gutachten_werte')
  .select(dbCols)
  .eq('claim_id', claimId)
  .maybeSingle()
```

- [ ] **Step 3: Erfolgs-Write (Zeile 256) auf RPC umstellen**

Aktuell:
```typescript
const { error } = await admin.from('claims').update(update).eq('id', claimId)
if (error) return { ok: false, error: error.message }
```

Ändern zu:
```typescript
const { error } = await admin.rpc('apply_gutachten_ocr', {
  p_claim_id: claimId,
  p_values: update,
})
if (error) return { ok: false, error: error.message }
```

- [ ] **Step 4: Fehler-Write fuer "Kein JSON" (Zeile 231-237) auf RPC umstellen**

Aktuell:
```typescript
await admin
  .from('claims')
  .update({
    gutachten_ocr_processed_at: new Date().toISOString(),
    gutachten_ocr_error: 'Kein JSON in Claude-Antwort gefunden',
  })
  .eq('id', claimId)
```

Ändern zu:
```typescript
await admin.rpc('apply_gutachten_ocr', {
  p_claim_id: claimId,
  p_values: {
    gutachten_ocr_processed_at: new Date().toISOString(),
    gutachten_ocr_error: 'Kein JSON in Claude-Antwort gefunden',
  },
})
```

- [ ] **Step 5: Fehler-Write fuer catch-Block (Zeile 273-280) auf RPC umstellen**

Aktuell:
```typescript
await admin
  .from('claims')
  .update({
    gutachten_ocr_processed_at: new Date().toISOString(),
    gutachten_ocr_error: msg,
  })
  .eq('id', claimId)
```

Ändern zu:
```typescript
await admin.rpc('apply_gutachten_ocr', {
  p_claim_id: claimId,
  p_values: {
    gutachten_ocr_processed_at: new Date().toISOString(),
    gutachten_ocr_error: msg,
  },
})
```

- [ ] **Step 6: tsc verifizieren**

```bash
npx tsc --noEmit 2>&1 | tail -5 && echo "exit=$?"
```

Expected: `exit=0`

---

### Task 10: Writer 2 — src/app/faelle/[id]/_actions/gutachten-ocr.ts auf RPC umstellen

**Files:**
- Modify: `src/app/faelle/[id]/_actions/gutachten-ocr.ts:105-107`

- [ ] **Step 1: Manueller Admin-Edit-Writer auf RPC umstellen**

Aktuell:
```typescript
const db = createAdminClient()
const { error } = await db.from('claims').update(cleaned).eq('id', claimId)
if (error) return { ok: false, error: error.message }
```

Ändern zu:
```typescript
const db = createAdminClient()
const { error } = await db.rpc('apply_gutachten_ocr', {
  p_claim_id: claimId,
  p_values: cleaned,
})
if (error) return { ok: false, error: error.message }
```

- [ ] **Step 2: tsc verifizieren**

```bash
npx tsc --noEmit 2>&1 | tail -5 && echo "exit=$?"
```

Expected: `exit=0`

---

### Task 11: Build verifizieren

**Files:**
- N/A

- [ ] **Step 1: npm run build**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/aar-session-koord-13-05" && NODE_OPTIONS="--max-old-space-size=8192" npm run build 2>&1 | grep -E "(error|fail|Error|✓|Compile)" | tail -8
```

Expected:
```
✓ Compiled successfully in <Nx>s
✓ Generating static pages using 21 workers (223/223) in <Nx>s
```

Bei Fehler — meistens TypeScript-Type-Mismatch in der RPC-Call-Signatur. Wenn types regenerated wurden, sollte `database['public']['Functions']['apply_gutachten_ocr']` automatisch typed sein.

---

### Task 12: Dual-Write-Smoke (Manuell + Screenshot)

**Files:**
- Create: `docs/14.05.2026/cluster-fg-pr1-smoke/smoke-ocr-dual-write.mjs`

- [ ] **Step 1: Smoke-Skript schreiben**

```javascript
#!/usr/bin/env node
// Cluster F+G PR-1 Smoke: OCR-Re-Run loest apply_gutachten_ocr aus,
// danach: claims.* und gutachten.* haben identische Werte (Dual-Write).

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein')

const admin = createClient(SUPABASE_URL, SERVICE_KEY)
const CLAIM_ID = process.env.SMOKE_CLAIM_ID || '<TODO: ID eines OCR-fertigen Test-Claims setzen>'

// 1) Vorher-Werte aus beiden Tabellen + View
const { data: claimsBefore } = await admin.from('claims').select('reparaturkosten_brutto, restwert, wiederbeschaffungswert, gutachten_fin, gutachten_lohnsatz_ak_eur').eq('id', CLAIM_ID).maybeSingle()
const { data: gutachtenBefore } = await admin.from('gutachten').select('reparaturkosten_brutto, restwert, wiederbeschaffungswert, gutachten_fin, gutachten_lohnsatz_ak_eur').eq('claim_id', CLAIM_ID).maybeSingle()
const { data: viewBefore } = await admin.from('v_gutachten_werte').select('reparaturkosten_brutto, restwert, wiederbeschaffungswert, gutachten_fin, gutachten_lohnsatz_ak_eur').eq('claim_id', CLAIM_ID).maybeSingle()
console.log('Before — claims:', claimsBefore, '\n        gutachten:', gutachtenBefore, '\n        view:', viewBefore)

// 2) apply_gutachten_ocr mit Test-Payload aufrufen
const testValues = {
  gutachten_ocr_processed_at: new Date().toISOString(),
  reparaturkosten_brutto: 9999.99,
  restwert: 1234.56,
  gutachten_fin: 'SMOKE-TEST-FIN-CFG',
}
const { error: rpcError } = await admin.rpc('apply_gutachten_ocr', { p_claim_id: CLAIM_ID, p_values: testValues })
if (rpcError) { console.error('RPC-Error:', rpcError); process.exit(1) }
console.log('✓ apply_gutachten_ocr ohne Error')

// 3) Nachher-Werte vergleichen
const { data: claimsAfter } = await admin.from('claims').select('reparaturkosten_brutto, restwert, wiederbeschaffungswert, gutachten_fin, gutachten_lohnsatz_ak_eur, gutachten_ocr_processed_at').eq('id', CLAIM_ID).maybeSingle()
const { data: gutachtenAfter } = await admin.from('gutachten').select('reparaturkosten_brutto, restwert, wiederbeschaffungswert, gutachten_fin, gutachten_lohnsatz_ak_eur, gutachten_ocr_processed_at').eq('claim_id', CLAIM_ID).maybeSingle()
const { data: viewAfter } = await admin.from('v_gutachten_werte').select('reparaturkosten_brutto, restwert, wiederbeschaffungswert, gutachten_fin, gutachten_lohnsatz_ak_eur, gutachten_ocr_processed_at').eq('claim_id', CLAIM_ID).maybeSingle()

const ok =
  claimsAfter?.reparaturkosten_brutto === gutachtenAfter?.reparaturkosten_brutto &&
  claimsAfter?.restwert === gutachtenAfter?.restwert &&
  claimsAfter?.gutachten_fin === gutachtenAfter?.gutachten_fin &&
  viewAfter?.reparaturkosten_brutto === claimsAfter?.reparaturkosten_brutto

if (!existsSync(__dirname)) mkdirSync(__dirname, { recursive: true })
writeFileSync(join(__dirname, 'result.json'), JSON.stringify({ ok, claimsAfter, gutachtenAfter, viewAfter }, null, 2))

console.log(ok ? '\n✓ Dual-Write OK — claims + gutachten + view identisch' : '\n❌ Dual-Write FAIL — siehe result.json')
process.exit(ok ? 0 : 1)
```

- [ ] **Step 2: Test-Claim-ID setzen + Smoke laufen**

```bash
# Vorher: aus Supabase Studio oder via SQL eine claim_id mit gutachten_ocr_processed_at IS NOT NULL holen
SMOKE_CLAIM_ID="<id-aus-test-daten>" node docs/14.05.2026/cluster-fg-pr1-smoke/smoke-ocr-dual-write.mjs 2>&1 | tail -10
```

Expected: `✓ Dual-Write OK — claims + gutachten + view identisch` und `result.json` mit `"ok": true`.

- [ ] **Step 3: Admin-Fallakte Screenshot (UI-Smoke per Memory feedback_smoke_screenshot_pflicht)**

```bash
# Dev-Server läuft auf localhost:3010 (gemäß heutiger Convention)
# Reuse smoke-admin-fallakte.mjs aus Stufe-0-Final-Smoke (Pattern bekannt)
cp docs/14.05.2026/stufe-0-final-smoke/smoke-admin-fallakte.mjs docs/14.05.2026/cluster-fg-pr1-smoke/smoke-admin-fallakte.mjs
# FALL_ID anpassen auf einen Claim mit OCR-Werten
# Erwartung: Admin-Fallakte rendert weiter; GutachtenOcrCard zeigt die OCR-Werte aus claims (PR-1 hat Reader noch nicht umgestellt)
BASE_URL=http://localhost:3010 node docs/14.05.2026/cluster-fg-pr1-smoke/smoke-admin-fallakte.mjs 2>&1 | tail -10
```

Expected: Page-Load OK, Screenshot generiert, keine zusätzlichen Hydration/RLS-Errors gegenüber Stufe-0-Final-Smoke-Baseline.

---

### Task 13: Commit + Push + PR

**Files:**
- N/A (Git-Aktionen)

- [ ] **Step 1: Status check**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/aar-session-koord-13-05" && git status -s
```

Expected:
```
A  supabase/migrations/<ts>_aar_cluster_fg_gutachten_schema.sql
M  src/lib/ai/gutachten-ocr.ts
M  src/app/faelle/[id]/_actions/gutachten-ocr.ts
M  src/lib/supabase/database.types.ts
A  docs/14.05.2026/cluster-fg-pr1-smoke/smoke-ocr-dual-write.mjs
A  docs/14.05.2026/cluster-fg-pr1-smoke/smoke-admin-fallakte.mjs
A  docs/14.05.2026/cluster-fg-pr1-smoke/result.json
A  docs/14.05.2026/cluster-fg-pr1-smoke/<screenshot-files>.png
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/ src/lib/ai/gutachten-ocr.ts src/app/faelle/\[id\]/_actions/gutachten-ocr.ts src/lib/supabase/database.types.ts docs/14.05.2026/cluster-fg-pr1-smoke/
git commit -m "$(cat <<'EOF'
feat(claims): Cluster F+G PR-1 — gutachten Sub-Table aufgebaut + Dual-Write-Function

Spec: docs/superpowers/specs/2026-05-14-cluster-fg-gutachten-subtable-design.md

PR-1 (dieser Commit):
- 38 Daten-Spalten auf gutachten gespiegelt (30 Cluster F + 8 Cluster G)
- 3 CHECK-Constraints (karosseriezustand, kalkulationssystem, kraftstoff)
- UNIQUE-Constraint gutachten_claim_id_unique (drop redundanten Index)
- Backfill: für jeden Claim mit gutachten_ocr_processed_at + faelle.sv_id
  eine gutachten-Row INSERT
- View v_gutachten_werte (security_invoker=true) mit COALESCE als
  Dual-Source-Reader für die Übergangsphase
- Postgres-Function apply_gutachten_ocr(claim_id, jsonb) als atomic
  Dual-Write auf claims+gutachten (eine TX, COALESCE schützt vor
  NULL-Overwrites, sv_id-Lookup via faelle)
- 4 OCR-Writer-Stellen auf rpc('apply_gutachten_ocr') umgestellt:
  - src/lib/ai/gutachten-ocr.ts: Idempotenz-Check + bestehende-Werte-
    Read auf View, 3 Writer-Stellen (Erfolg/Kein-JSON/catch-Block)
    auf RPC
  - src/app/faelle/[id]/_actions/gutachten-ocr.ts:106 (manueller
    Admin-Edit aus GutachtenOcrCard) auf RPC
- database.types.ts regeneriert

PR-2 (nach Merge) stellt 25 Reader auf v_gutachten_werte um und droppt
die 38 claims-Spalten.

Verifikation:
- Build grün
- Smoke: docs/14.05.2026/cluster-fg-pr1-smoke/result.json zeigt
  Dual-Write identisch auf claims + gutachten + View
- Admin-Fallakte rendert weiter (Reader liest noch claims, gleiches
  Bild wie Stufe-0-Final-Smoke-Baseline)

Out-of-Scope: Cluster H (Finanzierung → vehicles), gutachten_positionen/
_fotos, RLS-Recursion sv_buero_memberships, Drift-Bugs kunde_strasse/
halter_*, Hydration nested-<a>, 1:N Mehrfach-Gutachten (1:1 entschieden).

Audit:
- Build: grün
- UI: kein neuer Trigger (Reader liest in PR-1 weiter claims, ändert
  sich in PR-2)
- Redundanz: View+Function als Patterns aus Stufe-0/0.5/Final
- Dead-Code: nichts gedroppt in diesem PR (kommt in PR-2)
- Spec: alle Akzeptanzkriterien aus PR-1-Abschnitt erfüllt
- Inkonsistenz: CHECK-Constraints + UNIQUE 1:1 von claims kopiert
- Regression: Dual-Write hält claims-Stand identisch, alle 25 Reader
  funktionieren weiter wie vorher

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push**

```bash
git push -u origin kitta/aar-cluster-fg-gutachten 2>&1 | tail -5
```

- [ ] **Step 4: PR erstellen**

```bash
gh pr create --base main --head kitta/aar-cluster-fg-gutachten --title "feat(claims): Cluster F+G PR-1 — gutachten Sub-Table + Dual-Write-Function" --body "$(cat <<'EOF'
## Summary

Phased-Migration für Cluster F (30 OCR-Felder) + Cluster G (8 Wert-Felder) aus CLAIMS-VERTIKAL-AUDIT.md. PR-1 baut die `gutachten`-Sub-Table als Live-Pfad auf und setzt Dual-Write. PR-2 (separat nach Merge) stellt 25 Reader auf View um und droppt die claims-Spalten.

Spec: `docs/superpowers/specs/2026-05-14-cluster-fg-gutachten-subtable-design.md`
Plan: `docs/superpowers/plans/2026-05-14-cluster-fg-gutachten-pr1.md`

## Änderungen

- **Migration `<ts>_aar_cluster_fg_gutachten_schema.sql`**: 38 Spalten + 3 CHECK + UNIQUE auf gutachten, Backfill, View `v_gutachten_werte` (COALESCE Dual-Source, security_invoker=true), Function `apply_gutachten_ocr` (atomic Dual-Write, SECURITY DEFINER, search_path locked)
- **4 OCR-Writer auf RPC**: `src/lib/ai/gutachten-ocr.ts` (3 Stellen + 2 Reads auf View), `src/app/faelle/[id]/_actions/gutachten-ocr.ts:106` (manueller Admin-Edit)
- **`database.types.ts`** regeneriert

## 1:1-Multiplicity

Entscheidung: eine `gutachten`-Row pro Claim (UNIQUE auf `claim_id`). Nachbesichtigungen leben in den separaten `nachbesichtigung_*`-Spalten auf claims/faelle. Wenn das je 1:N werden soll, neuer Spec.

## Test plan

- [x] tsc --noEmit grün
- [x] npm run build grün
- [x] Smoke `smoke-ocr-dual-write.mjs`: apply_gutachten_ocr-RPC schreibt identische Werte auf claims + gutachten + view
- [x] Admin-Fallakte Smoke: rendert ohne Crash, GutachtenOcrCard zeigt OCR-Werte (Reader liest noch claims, unverändert)
- [ ] Nach Merge: in PR-2 die 25 Reader auf View umstellen + claims-Spalten droppen

## Out-of-Scope

- Cluster H (Finanzierung → vehicles, AAR-810 H2)
- gutachten_positionen + gutachten_fotos
- RLS-Recursion `sv_buero_memberships` (pre-existing aus Stufe-0-Final-Smoke)
- Drift-Bugs `kunde_strasse`/`halter_*`
- Hydration `KontaktRow > LinkComponent > PhoneButton`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" 2>&1 | tail -3
```

Expected: PR-URL ausgegeben.

---

## Akzeptanzkriterien (Ende PR-1)

- 38 Spalten + 3 CHECK + UNIQUE auf `gutachten` (Remote-DB)
- View `v_gutachten_werte` mit security_invoker + COALESCE
- Function `apply_gutachten_ocr` atomic auf claims + gutachten
- 4 OCR-Writer rufen Function statt direkt `claims.update()`
- `database.types.ts` regeneriert
- Build + tsc grün
- Smoke: claims + gutachten + view zeigen identische Werte nach Function-Call
- Admin-Fallakte rendert weiter (Reader-Verhalten unverändert)
- PR offen gegen `main`, wartet auf Aaron-Review

## Nach PR-1-Merge (eigener Plan-File)

`docs/superpowers/plans/2026-05-14-cluster-fg-gutachten-pr2.md` (folgt) wird:
- 25 Reader auf `v_gutachten_werte` umstellen (5 Commits: Admin/SV/Kunde/Makler+Shared/OCR-API+Lib)
- Sync-Trigger `sync_claims_to_faelle` + `sync_faelle_to_claims` ohne die 38 Spalten neu
- `v_claim_full` + `v_claim_for_gast` ohne die 38 recreate
- 38 Spalten von `claims` droppen
- `apply_gutachten_ocr` Function nur noch auf `gutachten` schreibend (claims-UPDATE entfernen)
- `v_gutachten_werte` recreate ohne COALESCE (claims-Source weg)
- Vollständige 4-Portal-Smoke mit Screenshots
