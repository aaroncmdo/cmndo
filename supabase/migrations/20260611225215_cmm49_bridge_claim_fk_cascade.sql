-- CMM-49: FK faelle_claim_bridge.claim_id -> claims.id (ON DELETE CASCADE).
-- Zweck: PostgREST-Embed `faelle_claim_bridge.claims:claim_id(...)` resolvebar machen
--   (Entity Display-Sweep: ~25 nested-Embed-Reader werden zu 1-Zeilen-Migrationen).
-- Warum CASCADE statt plain: cleanupAndFail() im Lead->Claim-Converter loescht den Claim
--   DIREKT (pre-faelle / faelle-insert-failed), waehrend die Bridge-Row via
--   trg_sync_claims_to_bridge (#2703) schon existiert. Ein plain/RESTRICT-FK wuerde dieses
--   Rollback blocken (Error wird ignoriert) -> ganzer Claim leakt. CASCADE raeumt die
--   Bridge-Row mit ab und fixt zugleich den bestehenden Orphan-Bridge-Leak aus
--   fehlgeschlagenen Konversionen. delete_fall_komplett(uuid,uuid) loescht faelle ZUERST
--   (Trigger raeumt die Bridge) -> CASCADE ist dort No-op. Keine der 10 NO-ACTION-Bridge-
--   Children referenziert die Row am Claim-Delete-Punkt (alle Late-Lifecycle, im
--   Converter-Rollback nicht vorhanden).
-- Gegencheck vor Apply: 0 Orphans (80/80 Bridge-Rows referenzieren valide Claims) ->
--   validiert sofort.
ALTER TABLE public.faelle_claim_bridge
  ADD CONSTRAINT fk_bridge_claim
  FOREIGN KEY (claim_id) REFERENCES public.claims(id)
  ON DELETE CASCADE;
