-- SECURITY: gate v_claim_workstate per-row (matches v_claim_phase) + re-grant authenticated.
-- The RLS guard (revoke 20260707175047) correctly flagged an ungated IDOR: v_claim_workstate
-- selects from v_claim_full, which is postgres-owned, NOT security_invoker, and does NOT
-- self-gate -> any authenticated user could read all claims. Adding the explicit
-- claim_sichtbar_fuer_aktuellen_user(claim_id) predicate makes it genuinely gated.
CREATE OR REPLACE VIEW public.v_claim_workstate AS
SELECT
  f.id                              AS claim_id,
  f.claim_nummer,
  f.lead_id,
  f.kundenbetreuer_id,
  f.sv_id,
  f.main_phase,
  f.sub_phase,
  f.status,
  f.operative_status,
  f.ist_aktiv,
  f.kennzeichen,
  NULLIF(TRIM(COALESCE(f.kunde_vorname, '') || ' ' || COALESCE(f.kunde_nachname, '')), '') AS kunde_name,
  COALESCE(f.regulierung_betrag, f.regulierungs_betrag, f.gutachten_betrag) AS schadenhoehe,
  f.sa_unterschrieben,
  f.sv_zugewiesen_am,
  f.gutachten_eingegangen_am,
  f.anschlussschreiben_am,
  f.regulierung_am,
  f.abgeschlossen_am,
  f.storniert_am,
  f.updated_at,
  f.created_at,
  f.dokumente_vollstaendig_fuer_phase,
  f.vs_eskalationsstufe,
  f.fall_id
FROM public.v_claim_full f
WHERE public.claim_sichtbar_fuer_aktuellen_user(f.id);

GRANT SELECT ON public.v_claim_workstate TO authenticated;
