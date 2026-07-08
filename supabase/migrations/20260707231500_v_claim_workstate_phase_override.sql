-- Phase 1d: cockpit respects claims.phase_override. main_phase = COALESCE(override, derived);
-- expose override_phase so the hover can show "Override aktiv" + clear it. Gate + grant preserved.
-- Existing columns unchanged (main_phase same name/type/pos; expression only), override_phase appended.
CREATE OR REPLACE VIEW public.v_claim_workstate AS
SELECT
  f.id                              AS claim_id,
  f.claim_nummer,
  f.lead_id,
  f.kundenbetreuer_id,
  f.sv_id,
  COALESCE(c.phase_override, f.main_phase) AS main_phase,
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
  f.fall_id,
  c.notizen               AS edit_notizen,
  c.interne_notizen       AS edit_interne_notizen,
  c.schadens_hoehe_netto  AS edit_schadens_hoehe_netto,
  c.phase_override        AS override_phase
FROM public.v_claim_full f
LEFT JOIN public.claims c ON c.id = f.id
WHERE public.claim_sichtbar_fuer_aktuellen_user(f.id);

GRANT SELECT ON public.v_claim_workstate TO authenticated;
