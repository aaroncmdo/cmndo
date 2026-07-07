-- v_claim_workstate: lean work-state projection over v_claim_full for the ops cockpits.
-- Additive, read-only. Inherits v_claim_full's RLS gating (claim_sichtbar_fuer_aktuellen_user).
CREATE VIEW public.v_claim_workstate AS
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
  f.vs_eskalationsstufe
FROM public.v_claim_full f;
