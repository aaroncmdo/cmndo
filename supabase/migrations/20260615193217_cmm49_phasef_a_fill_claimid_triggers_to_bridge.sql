-- CMM-49 Phase F (Batch A): die fill-claim_id-from-fall Trigger-Funktionen faelle-frei.
-- Lookup faelle.id->claim_id  =>  faelle_claim_bridge.fall_id->claim_id (identische 1:1-Map,
-- 0 divergent, KEINE FKs -> ueberlebt DROP TABLE faelle). Verhalten unveraendert.
-- Attribute (SECURITY/search_path) je Funktion EXAKT erhalten. derive_claim_id_from_fall war
-- schon bridge-basiert (faelle nur im Kommentar) -> nicht angefasst.

CREATE OR REPLACE FUNCTION public.auftraege_sync_claim_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id
    FROM public.faelle_claim_bridge
    WHERE fall_id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_fall_dokumente_claim_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id
    FROM public.faelle_claim_bridge
    WHERE fall_id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_fill_claim_id_from_fall()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT b.claim_id INTO NEW.claim_id FROM public.faelle_claim_bridge b WHERE b.fall_id = NEW.fall_id;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.kanzlei_faelle_sync_claim_fall()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Wenn nur fall_id gesetzt: claim_id daraus ableiten (bridge).
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id FROM public.faelle_claim_bridge WHERE fall_id = NEW.fall_id;
  END IF;
  -- Wenn nur claim_id gesetzt: fall_id daraus ableiten (bridge 1:1).
  IF NEW.fall_id IS NULL AND NEW.claim_id IS NOT NULL THEN
    SELECT fall_id INTO NEW.fall_id FROM public.faelle_claim_bridge WHERE claim_id = NEW.claim_id LIMIT 1;
  END IF;
  RETURN NEW;
END $function$;
