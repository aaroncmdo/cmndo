-- CMM-49 P2: v_claim_listing faelle-frei via Bridge-Map.
-- Einziger faelle-Ref war `LEFT JOIN faelle f` + `f.id AS fall_id` -> auf
-- faelle_claim_bridge umgestellt. Output identisch (fall_id = faelle.id des Claims).
-- security_invoker=false unveraendert bewahrt (Security-Posture = Sache eines
-- separaten gegateten Schritts, nicht hier).
CREATE OR REPLACE VIEW public.v_claim_listing
WITH (security_invoker = false) AS
 SELECT c.id AS claim_id,
    c.claim_nummer,
    c.status,
    c.schadentag,
    c.kunden_konstellation,
    c.created_at,
    c.updated_at,
    fb.fall_id AS fall_id,
    c.sv_id,
    c.kundenbetreuer_id AS faelle_kundenbetreuer_id,
    c.kundenbetreuer_id AS claim_kundenbetreuer_id,
    c.service_typ,
    p.anzeigename AS kunde_anzeigename,
    p.vorname AS kunde_vorname,
    p.nachname AS kunde_nachname,
    v.kennzeichen_aktuell AS kennzeichen,
    vcp.main_phase,
    vcp.sub_phase
   FROM claims c
     LEFT JOIN faelle_claim_bridge fb ON fb.claim_id = c.id
     LEFT JOIN profiles p ON p.id = c.geschaedigter_user_id
     LEFT JOIN vehicles v ON v.id = c.vehicle_id
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;
