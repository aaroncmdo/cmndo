-- CMM-49 PC-4: drop-safe delete_fall_komplett(p_fall_id, p_claim_id).
-- Additiver 2-arg-Overload (das 1-arg bleibt fuer Deploy-Safety; wird in PC-7/Drop entfernt).
-- Drop-safe: Sub-Entity-Deletes via dynamic EXECUTE (kein statisches faelle/legacy-Ref →
-- bricht nicht nach DROP TABLE faelle, robust gegen fehlende Legacy-Tische). Reihenfolge:
-- NO-ACTION-FK-Blocker + CASCADE-Children explizit (per fall_id, zusaetzlich claim_id fuer
-- Blocker) → faelle-Zeile NUR solange Tabelle existiert (faelle.claim_id ist ON DELETE
-- RESTRICT → faelle MUSS vor dem Claim weg) → Claim (cascadet den Rest via claims-FKs).
-- Das alte 1-arg liess den Claim verwaist — hier mitgeloescht (SSoT-korrekt).
CREATE OR REPLACE FUNCTION public.delete_fall_komplett(p_fall_id uuid, p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tbl text;
  v_fall_tables text[] := ARRAY[
    'lead_historie','pflichtdokumente','qc_checkliste','forderungspositionen',
    'zahlungseingaenge','technische_probleme','gutachter_abrechnungspositionen',
    'gutachter_abrechnungen','gutachter_termine','gutachter_mitteilungen',
    'benachrichtigungen','abrechnung_positionen','kanzlei_abrechnung_positionen',
    'makler_provisionen','timeline','tasks','nachrichten','dokumente','fall_dokumente',
    'termine','flow_links'
  ];
  v_claim_tables text[] := ARRAY[
    'technische_probleme','gutachter_abrechnungspositionen','gutachter_abrechnungen',
    'gutachter_mitteilungen','abrechnung_positionen','kanzlei_abrechnung_positionen',
    'makler_provisionen'
  ];
BEGIN
  IF p_fall_id IS NULL AND p_claim_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: fall_id UND claim_id sind beide NULL';
  END IF;

  IF p_fall_id IS NOT NULL THEN
    FOREACH v_tbl IN ARRAY v_fall_tables LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE fall_id = $1', v_tbl) USING p_fall_id;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  IF p_claim_id IS NOT NULL THEN
    FOREACH v_tbl IN ARRAY v_claim_tables LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE claim_id = $1', v_tbl) USING p_claim_id;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  -- faelle-Zeile (conditional, dynamic) — vor dem Claim (RESTRICT), cascadet faelle-Children
  IF p_fall_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'faelle') THEN
    EXECUTE 'DELETE FROM public.faelle WHERE id = $1' USING p_fall_id;
  END IF;

  -- Claim (SSoT) — cascadet claims-Children. Nicht defensiv: Fehler soll surfacen.
  IF p_claim_id IS NOT NULL THEN
    DELETE FROM claims WHERE id = p_claim_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_fall_komplett(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_fall_komplett(uuid, uuid) TO service_role;
