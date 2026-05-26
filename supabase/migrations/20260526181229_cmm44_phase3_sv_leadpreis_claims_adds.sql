-- CMM-44 Phase 3 (Writer-Migration) — SV-Leadpreis: per-Case Lead-Preis
-- additiv auf claims (SSoT).
--
-- Teil der CMM-44-Vollmigration (Claim-as-SSoT, faelle -> Phase-6-DROP). Drei
-- faelle-Spalten des per-Case berechneten Lead-Preises relocaten auf claims:
--   * lead_preis_netto        numeric      (Lead-Preis netto, processCaseBilling)
--   * lead_preis_typ          text         ('paket' | 'einzel')
--   * lead_preis_berechnet_am timestamptz  (Berechnungs-Zeitpunkt)
--
-- ZIEL = claims: 1 Fall = 1 Claim, der Lead-Preis ist claim-global. Die beiden
-- INVARIANTEN-Geschwister (lead_preis_netto = guthaben_verrechnet_netto +
-- sv_nachzahlung_netto) liegen seit CMM-44 SP-J Bucket B BEREITS auf claims —
-- diese Slice schliesst die Split-Home-Inkonsistenz (Summe + Summanden auf
-- claims, aber lead_preis_* noch auf faelle).
--
-- NICHT betroffen: gutachter_abrechnungen.leadpreis (Abrechnungs-Header) und die
-- Abrechnungs-Positions-Snapshots lead_preis_netto/lead_preis_typ — das sind
-- Abrechnungsdokument-Felder (Aggregat/Line-Item-Snapshot), KEINE konkurrierende
-- Heimat fuer den live per-Case-Preis. Bleiben wo sie sind.
--
-- ADDITIV ONLY: kein faelle-DROP (faelle stirbt erst in Phase 6). Reine
-- Relocation + IS-NULL-guarded Backfill (idempotent).

BEGIN;

-- 1) Spalten additiv anlegen (Typen EXAKT = faelle-Quelle, alle nullable).
--    lead_preis_netto = numeric(10,2): MUSS die faelle-Praezision matchen, sonst
--    wirft der View-Repoint unten "cannot change data type of view column ...
--    numeric(10,2) to numeric" (42P16). Lektion CMM-44 SP-G.
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS lead_preis_netto numeric(10,2);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS lead_preis_typ text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS lead_preis_berechnet_am timestamptz;

-- 2) Backfill faelle -> claims (IS-NULL-guarded, idempotent). Stand 2026-05-26
--    coverage=0 (kein Fall hat lead_preis gesetzt) -> faktisch No-Op, aber sicher.
UPDATE public.claims c
   SET lead_preis_netto = f.lead_preis_netto
  FROM public.faelle f
 WHERE f.claim_id = c.id AND f.lead_preis_netto IS NOT NULL AND c.lead_preis_netto IS NULL;

UPDATE public.claims c
   SET lead_preis_typ = f.lead_preis_typ
  FROM public.faelle f
 WHERE f.claim_id = c.id AND f.lead_preis_typ IS NOT NULL AND c.lead_preis_typ IS NULL;

UPDATE public.claims c
   SET lead_preis_berechnet_am = f.lead_preis_berechnet_am
  FROM public.faelle f
 WHERE f.claim_id = c.id AND f.lead_preis_berechnet_am IS NOT NULL AND c.lead_preis_berechnet_am IS NULL;

-- 3) View-Repoint v_faelle_mit_aktuellem_termin -> c.* fuer die 3 Spalten.
--    lead_preis_netto + lead_preis_typ werden via die View gelesen
--    (reissue-abrechnung, abrechnung-erstellen) -> Pflicht-Repoint. Alle drei
--    sind in der View projiziert (live verifiziert: 'f.lead_preis_*,'), daher
--    RAISE-Guard auf allen drei. Technik wie CMM-65 Part B / Bankdaten-Slice:
--    server-seitig pg_get_viewdef + gezieltes replace() + security_invoker-Preserve.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_secinv text;
BEGIN
  SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'), 'false')
    INTO v_secinv FROM pg_class c WHERE c.oid = 'public.v_faelle_mit_aktuellem_termin'::regclass;
  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass);

  v_new := replace(v_def, 'f.lead_preis_netto,', 'c.lead_preis_netto,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.lead_preis_netto substring not found (no-op)'; END IF;
  v_def := v_new;

  v_new := replace(v_def, 'f.lead_preis_typ,', 'c.lead_preis_typ,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.lead_preis_typ substring not found (no-op)'; END IF;
  v_def := v_new;

  v_new := replace(v_def, 'f.lead_preis_berechnet_am,', 'c.lead_preis_berechnet_am,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.lead_preis_berechnet_am substring not found (no-op)'; END IF;
  v_def := v_new;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_def;
  EXECUTE format('ALTER VIEW public.v_faelle_mit_aktuellem_termin SET (security_invoker = %s)', v_secinv);
END $$;

COMMIT;
