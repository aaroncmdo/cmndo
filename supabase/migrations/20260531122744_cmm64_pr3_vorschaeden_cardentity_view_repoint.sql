-- CMM-64 PR3: v_claim_full + v_faelle_mit_aktuellem_termin lesen vorschaden/cardentity nicht mehr
-- aus faelle, sondern aus claims-Flags + vehicle_vorschaeden (LATERAL) + vehicles.cardentity_report.
-- Aaron-Entscheidung Option 2 (Backfill + Repoint). Fail-safe: Backfill -> Snapshot (nach Backfill,
-- damit der updated_at-Trigger-Bump in beiden Seiten ist) -> Repoint -> EXCEPT-0/0-Guard (RAISE+Rollback).
-- Andere f.-Reads (gegner/org/dispatch/kunde_id/status/halter/fahrzeug-COALESCE) bleiben (= andere Tickets).
--
-- Semantik-Merge hat_vorschaeden/geprueft/erkannt: leads/faelle = Kunden-Selbstauskunft (default false),
-- claims (CMM-64) = Ergebnis des CarDentity-Checks (null bis abgefragt). Hier in EIN Feld zusammengefuehrt
-- (faktisch "hat (irgendwie bekannte) Vorschaeden"). vorschaden_anzahl = NULLIF(count,0) bewahrt die alte
-- NULL-Semantik ("keine bekannt") bei leerem vehicle_vorschaeden; >0 sobald Eintraege existieren.
--
-- replace()-Transform der Live-Viewdef (Vorlage cmm50.3b 20260530205453 / cmm66 20260530222551):
-- replay-sicher, weil es die zur Replay-Zeit existierende Viewdef transformiert. Self-Assert + EXCEPT-0/0.
DO $$
DECLARE v_cf text; v_vfat text; diff_cf bigint; diff_vfat bigint;
BEGIN
  SET LOCAL lock_timeout = '8s';

  -- 1. Backfill der 3 Boolean-Flags (false×74 vs null) — COALESCE, set-once, kein Clobber.
  UPDATE public.claims c SET
    hat_vorschaeden     = COALESCE(c.hat_vorschaeden, f.hat_vorschaeden),
    vorschaden_geprueft = COALESCE(c.vorschaden_geprueft, f.vorschaden_geprueft),
    vorschaden_erkannt  = COALESCE(c.vorschaden_erkannt, f.vorschaden_erkannt)
  FROM public.faelle f
  WHERE f.claim_id = c.id
    AND (c.hat_vorschaeden IS NULL OR c.vorschaden_geprueft IS NULL OR c.vorschaden_erkannt IS NULL);

  -- 2. Output-Snapshots NACH Backfill (updated_at-Bump damit in beiden Seiten neutralisiert)
  CREATE TEMP TABLE _vcf_old ON COMMIT DROP AS SELECT * FROM public.v_claim_full;
  CREATE TEMP TABLE _vfat_old ON COMMIT DROP AS SELECT * FROM public.v_faelle_mit_aktuellem_termin;

  -- 3. v_claim_full repoint (5 Felder)
  v_cf := pg_get_viewdef('public.v_claim_full'::regclass, true);
  v_cf := replace(v_cf, 'f.hat_vorschaeden,', 'c.hat_vorschaeden,');
  v_cf := replace(v_cf, 'f.vorschaden_anzahl,', 'vv.anzahl AS vorschaden_anzahl,');
  v_cf := replace(v_cf, 'f.vorschaden_letzter_datum,', 'vv.letzter_datum AS vorschaden_letzter_datum,');
  v_cf := replace(v_cf, 'f.vorschaden_typ_b_bericht,', '(veh.cardentity_report -> ''typB''::text) AS vorschaden_typ_b_bericht,');
  v_cf := replace(v_cf, 'f.cardentity_abfrage_am,', 'veh.cardentity_letzter_pull AS cardentity_abfrage_am,');
  v_cf := replace(v_cf, 'LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id',
    'LEFT JOIN LATERAL ( SELECT NULLIF(count(*), 0)::integer AS anzahl, max(vv0.schaden_datum) AS letzter_datum FROM vehicle_vorschaeden vv0 WHERE vv0.vehicle_id = c.vehicle_id) vv ON true LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id');
  IF v_cf ~ 'f\.(hat_vorschaeden|vorschaden_anzahl|vorschaden_letzter_datum|vorschaden_typ_b_bericht|cardentity_abfrage_am)' THEN
    RAISE EXCEPTION 'v_claim_full: vorschaden/cardentity-faelle-Ref nach Transform noch vorhanden';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || v_cf;

  -- 4. v_faelle_mit_aktuellem_termin repoint (12 Felder)
  v_vfat := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  v_vfat := replace(v_vfat, 'f.vorschaden_geprueft,', 'c.vorschaden_geprueft,');
  v_vfat := replace(v_vfat, 'f.vorschaden_anzahl,', 'vv.anzahl AS vorschaden_anzahl,');
  v_vfat := replace(v_vfat, 'f.vorschaden_letzter_datum,', 'vv.letzter_datum AS vorschaden_letzter_datum,');
  v_vfat := replace(v_vfat, 'f.vorschaden_typ_a_ergebnis,', '(veh.cardentity_report -> ''typA''::text) AS vorschaden_typ_a_ergebnis,');
  v_vfat := replace(v_vfat, 'f.vorschaden_typ_b_bericht,', '(veh.cardentity_report -> ''typB''::text) AS vorschaden_typ_b_bericht,');
  v_vfat := replace(v_vfat, 'f.vorschaden_typ_b_pdf_url,', '(veh.cardentity_report ->> ''pdfUrl''::text) AS vorschaden_typ_b_pdf_url,');
  v_vfat := replace(v_vfat, 'f.cardentity_abfrage_am,', 'veh.cardentity_letzter_pull AS cardentity_abfrage_am,');
  v_vfat := replace(v_vfat, 'f.hat_vorschaeden,', 'c.hat_vorschaeden,');
  v_vfat := replace(v_vfat, 'f.vorschaeden_beschreibung,', 'c.vorschaeden_beschreibung,');
  v_vfat := replace(v_vfat, 'f.cardentity_enriched_at,', 'veh.cardentity_letzter_pull AS cardentity_enriched_at,');
  v_vfat := replace(v_vfat, 'f.cardentity_report,', 'veh.cardentity_report AS cardentity_report,');
  v_vfat := replace(v_vfat, 'f.vorschaden_erkannt,', 'c.vorschaden_erkannt,');
  v_vfat := replace(v_vfat, 'LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id',
    'LEFT JOIN LATERAL ( SELECT NULLIF(count(*), 0)::integer AS anzahl, max(vv0.schaden_datum) AS letzter_datum FROM vehicle_vorschaeden vv0 WHERE vv0.vehicle_id = c.vehicle_id) vv ON true LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id');
  IF v_vfat ~ 'f\.(hat_vorschaeden|vorschaeden_beschreibung|vorschaden_geprueft|vorschaden_erkannt|vorschaden_anzahl|vorschaden_letzter_datum|vorschaden_typ_a_ergebnis|vorschaden_typ_b_bericht|vorschaden_typ_b_pdf_url|cardentity_abfrage_am|cardentity_enriched_at|cardentity_report)' THEN
    RAISE EXCEPTION 'vfat: vorschaden/cardentity-faelle-Ref nach Transform noch vorhanden';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_vfat;

  -- 5. EXCEPT-0/0-Guard
  EXECUTE 'SELECT count(*) FROM ((TABLE _vcf_old EXCEPT TABLE public.v_claim_full) UNION ALL (TABLE public.v_claim_full EXCEPT TABLE _vcf_old)) x' INTO diff_cf;
  IF diff_cf <> 0 THEN RAISE EXCEPTION 'v_claim_full EXCEPT != 0/0: % abweichende Rows', diff_cf; END IF;
  EXECUTE 'SELECT count(*) FROM ((TABLE _vfat_old EXCEPT TABLE public.v_faelle_mit_aktuellem_termin) UNION ALL (TABLE public.v_faelle_mit_aktuellem_termin EXCEPT TABLE _vfat_old)) x' INTO diff_vfat;
  IF diff_vfat <> 0 THEN RAISE EXCEPTION 'vfat EXCEPT != 0/0: % abweichende Rows', diff_vfat; END IF;
END $$;
