-- CMM-49: derive_claim_id_from_fall() liest die claim_id jetzt aus der
-- faelle_claim_bridge (fall_id -> claim_id) statt aus public.faelle.
--
-- Warum: Dieser SECURITY-DEFINER-Trigger haengt an 35 Tabellen und fuellt bei
-- fall_id-Inserts die claim_id. Solange er public.faelle liest, bricht jeder
-- dieser Inserts nach DROP TABLE faelle -> der harte DROP-Gate.
--
-- Sicherheit / Value-Identitaet (live verifiziert, 78 Rows):
--   * faelle_claim_bridge haelt die identische Map: 0 divergent_mapping
--     (faelle.claim_id IS DISTINCT FROM bridge.claim_id == 0),
--     0 bridge_without_faelle, keine NULLs auf beiden Seiten.
--   * Die Bridge wird via sync_faelle_claim_bridge auto-maintained
--     (faelle_without_bridge == 0) und hat KEINE Foreign Keys -> sie
--     ueberlebt DROP TABLE faelle.
-- Verhalten daher unveraendert; entfernt aber die faelle-Abhaengigkeit des
-- Triggers (CREATE OR REPLACE -> alle 35 Trigger nutzen automatisch den neuen
-- Rumpf, SECURITY DEFINER + leerer search_path bleiben erhalten).

CREATE OR REPLACE FUNCTION public.derive_claim_id_from_fall()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.fall_id IS NOT NULL
     AND (NEW.claim_id IS NULL
          OR (TG_OP = 'UPDATE' AND NEW.fall_id IS DISTINCT FROM OLD.fall_id)) THEN
    SELECT b.claim_id INTO NEW.claim_id FROM public.faelle_claim_bridge b WHERE b.fall_id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$function$;
