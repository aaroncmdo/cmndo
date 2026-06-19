-- CMM-49 faelle-DROP-Runway: claims->faelle sv_id-Sync droppen (Pre-DROP-Blocker-Entfernung).
-- claims ist sv_id-SSoT (#2911); faelle.sv_id ist reader-frei (FAELLE_SELECT/search liest es NICHT;
-- 0 weitere prod-Reader; 0 Views referenzieren faelle). Der claims->faelle-Sync (Trigger auf claims
-- -> UPDATE faelle SET sv_id WHERE claim_id=NEW.id) wuerde nach DROP TABLE faelle jeden
-- claims.sv_id-Write brechen (42703) -> daher jetzt entfernen. faelle.sv_id wird ab jetzt nicht mehr
-- aus claims gespiegelt (vestigial, reader-frei).
-- BLEIBT: faelle->claims-Richtung (trg_sync_faelle_sv_id_to_claims + sync_faelle_sv_id_to_claims) —
-- gutachter/team:68 schreibt faelle.sv_id und braucht den Mirror nach claims.sv_id; stirbt mit
-- DROP TABLE faelle CASCADE (Schritt G).
DROP TRIGGER IF EXISTS trg_sync_claims_sv_id_to_faelle ON public.claims;
DROP FUNCTION IF EXISTS public.sync_claims_sv_id_to_faelle();
