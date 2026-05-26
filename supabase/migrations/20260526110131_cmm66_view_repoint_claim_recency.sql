-- CMM-66 PR2b — View-Repoint der Recency auf claim_recency (SSoT).
--
-- v_claim_full.fall_updated_at + v_faelle_mit_aktuellem_termin.updated_at zeigten
-- auf f.updated_at (faelle). Seit dem CMM-65-Writer-Sweep wird faelle.updated_at
-- aber nicht mehr aktiv geschrieben (Recency liegt auf claims/claim_recency) →
-- stale. Hier auf die leak-freie, backfill-resistente claim_recency.last_activity_at
-- umgebogen. v_faelle...created_at zusaetzlich von f.created_at auf c.created_at
-- (claims = SSoT, NOT NULL).
--
-- Technik (server-seitig, ohne JOIN-Surgery an den 90/200-Spalten-Views):
--   * pg_get_viewdef + gezieltes replace() der EINEN Spalten-Expression je View
--     durch eine korrelierte Scalar-Subquery auf claim_recency.
--   * COALESCE(..., c.created_at) Fallback: ein brandneuer Claim ohne
--     claim_recency-Row (Row entsteht erst bei erstem touch_claim_recency) liefert
--     so created_at statt NULL — fall_updated_at/updated_at bleiben NOT NULL wie zuvor.
--   * RAISE-Guard falls ein Substring nicht matcht (no-op) → Migration bricht ab,
--     Views bleiben unangetastet.
--   * security_invoker wird ausgelesen + nach CREATE OR REPLACE wieder gesetzt
--     (CREATE OR REPLACE VIEW setzt Optionen sonst auf Default zurueck).
-- Spalten-Namen/-Typen bleiben identisch (timestamptz) → CREATE OR REPLACE zulaessig,
-- database.types.ts unveraendert.
--
-- Design: docs/26.05.2026/cmm66-claim-recency-design.md

BEGIN;

DO $$
DECLARE
  v_def text;
  v_new text;
  v_secinv text;
BEGIN
  -- === v_claim_full: fall_updated_at -> claim_recency.last_activity_at ===
  SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'), 'false')
    INTO v_secinv FROM pg_class c WHERE c.oid = 'public.v_claim_full'::regclass;
  v_def := pg_get_viewdef('public.v_claim_full'::regclass);
  v_new := replace(
    v_def,
    'f.updated_at AS fall_updated_at',
    'COALESCE(( SELECT cr.last_activity_at FROM public.claim_recency cr WHERE (cr.claim_id = c.id)), c.created_at) AS fall_updated_at'
  );
  IF v_new = v_def THEN RAISE EXCEPTION 'v_claim_full: fall_updated_at substring not found (no-op)'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || v_new;
  EXECUTE format('ALTER VIEW public.v_claim_full SET (security_invoker = %s)', v_secinv);

  -- === v_faelle_mit_aktuellem_termin: updated_at -> claim_recency, created_at -> claims ===
  SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'), 'false')
    INTO v_secinv FROM pg_class c WHERE c.oid = 'public.v_faelle_mit_aktuellem_termin'::regclass;
  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass);
  v_new := replace(
    v_def,
    'f.updated_at,',
    'COALESCE(( SELECT cr.last_activity_at FROM public.claim_recency cr WHERE (cr.claim_id = c.id)), c.created_at) AS updated_at,'
  );
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: updated_at substring not found (no-op)'; END IF;
  v_def := v_new;
  v_new := replace(v_def, 'f.created_at,', 'c.created_at,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: created_at substring not found (no-op)'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_new;
  EXECUTE format('ALTER VIEW public.v_faelle_mit_aktuellem_termin SET (security_invoker = %s)', v_secinv);
END $$;

COMMIT;
