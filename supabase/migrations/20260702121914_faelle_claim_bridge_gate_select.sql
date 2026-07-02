-- Kanzlei-Fix: faelle_claim_bridge war fuer rolle=kanzlei leer (kanzlei/mandate + kanzlei/kanban
-- blank), weil die bestehende Consolidated-Policy den kanzlei-Arm via EXISTS(SELECT FROM claims ...)
-- prueft und claims fuer kanzlei nicht SELECT-bar ist (kein kanzlei-Arm auf claims).
-- Statt kanzlei rohen claims-SELECT zu geben (wuerde die View-Column-Nuller aus #3250 umgehen und
-- komplett-Claims mit sensiblen Spalten re-leaken), ergaenzen wir eine ADDITIVE Bridge-SELECT-Policy,
-- die die KANONISCHE Definer-Gate-Funktion claim_sichtbar_fuer_aktuellen_user(claim_id) nutzt
-- (Single Source of Truth, bereits von allen Claim-Views verwendet). Additiv (permissive OR) ->
-- kein Zugriff wird entzogen; faelle_claim_bridge ist reine id-Mapping-Tabelle (fall_id/claim_id +
-- timestamps, keine PII); die Mandats-Daten kommen weiterhin aus v_claim_full (column-safe gate).
CREATE POLICY "faelle_claim_bridge_gate_select" ON public.faelle_claim_bridge
  FOR SELECT
  TO authenticated
  USING (claim_sichtbar_fuer_aktuellen_user(claim_id));
