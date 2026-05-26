-- CMM-44 Phase 3 (Writer-Migration) — Bankdaten: faelle-Auszahlungs-Bankdaten
-- additiv auf claims (SSoT).
--
-- Teil der CMM-44-Vollmigration (Claim-as-SSoT, faelle -> Phase-6-DROP). Vier
-- faelle-Spalten der Kunden-Auszahlung relocaten auf claims:
--   * iban                    text         (Auszahlungs-IBAN des Geschaedigten)
--   * bic                     text
--   * kontoinhaber            text
--   * bankdaten_hinterlegt_am timestamptz  ("Kunde hat Bankdaten hinterlegt"-Flag)
--
-- ZIEL = claims: claim-globale Auszahlungs-Daten, 1:1 mit faelle (jeder Fall hat
-- eine Heimat). Konsistent mit CMM-65 Part B `zahlungsweg` (= Kunden-Auszahlungs-
-- ZIEL), das im selben Auszahlungs-Domaenen-Cluster claims-nativ liegt. Der
-- bestehende Writer-Kommentar (kunde/faelle/[id]/actions.ts) hat den Umzug nach
-- claims bereits vorgemerkt.
--
-- ADDITIV ONLY: kein faelle-DROP (faelle stirbt erst in Phase 6). Reine Relocation
-- + IS-NULL-guarded Backfill (idempotent). Einziger App-Reader ist
-- bankdaten_hinterlegt_am (als Flag, via v_faelle_mit_aktuellem_termin +
-- get-kunde-faelle); iban/bic/kontoinhaber werden nur geschrieben (Auszahlungs-
-- Referenz), in-App nicht zurueckgelesen.

BEGIN;

-- 1) Spalten additiv anlegen (Typen = faelle-Quelle, alle nullable).
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS bic text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS kontoinhaber text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS bankdaten_hinterlegt_am timestamptz;

-- 2) Backfill faelle -> claims (IS-NULL-guarded, idempotent).
UPDATE public.claims c
   SET iban = f.iban
  FROM public.faelle f
 WHERE f.claim_id = c.id AND f.iban IS NOT NULL AND c.iban IS NULL;

UPDATE public.claims c
   SET bic = f.bic
  FROM public.faelle f
 WHERE f.claim_id = c.id AND f.bic IS NOT NULL AND c.bic IS NULL;

UPDATE public.claims c
   SET kontoinhaber = f.kontoinhaber
  FROM public.faelle f
 WHERE f.claim_id = c.id AND f.kontoinhaber IS NOT NULL AND c.kontoinhaber IS NULL;

UPDATE public.claims c
   SET bankdaten_hinterlegt_am = f.bankdaten_hinterlegt_am
  FROM public.faelle f
 WHERE f.claim_id = c.id AND f.bankdaten_hinterlegt_am IS NOT NULL AND c.bankdaten_hinterlegt_am IS NULL;

-- 3) View-Repoint v_faelle_mit_aktuellem_termin -> c.* fuer die Bankdaten-Spalten.
--    bankdaten_hinterlegt_am wird via die View gelesen (FALL_SELECT_KUNDE +
--    page.tsx) -> MUSS repointet werden (RAISE-Guard, Projektion ist sicher).
--    iban/bic/kontoinhaber: nur repointen WENN die View sie projiziert (kein
--    RAISE — sie sind in-App nicht view-gelesen, koennen also fehlen).
--    Technik wie CMM-65 Part B / CMM-66 PR2b: server-seitig pg_get_viewdef +
--    gezieltes replace() + security_invoker-Preserve.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_secinv text;
BEGIN
  SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'), 'false')
    INTO v_secinv FROM pg_class c WHERE c.oid = 'public.v_faelle_mit_aktuellem_termin'::regclass;
  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass);

  -- bankdaten_hinterlegt_am: Pflicht-Repoint (view-gelesen).
  v_new := replace(v_def, 'f.bankdaten_hinterlegt_am,', 'c.bankdaten_hinterlegt_am,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.bankdaten_hinterlegt_am substring not found (no-op)'; END IF;
  v_def := v_new;

  -- iban/bic/kontoinhaber: nur wenn projiziert (kein RAISE).
  v_def := replace(v_def, 'f.iban,', 'c.iban,');
  v_def := replace(v_def, 'f.bic,', 'c.bic,');
  v_def := replace(v_def, 'f.kontoinhaber,', 'c.kontoinhaber,');

  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_def;
  EXECUTE format('ALTER VIEW public.v_faelle_mit_aktuellem_termin SET (security_invoker = %s)', v_secinv);
END $$;

COMMIT;
