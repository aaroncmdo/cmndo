-- WS6 Slice 2 (6a): expose repair-claim fields on v_claim_workstate so the Ops
-- deriver can compute a repair phase. Purely ADDITIVE (4 columns appended at the end);
-- abrechnungsweg + reparatur_werkstatt_id come from the already-joined claims alias (c),
-- reparatur_status/erledigt_am via LATERAL (latest reparatur_termine, no row multiplication).
-- Supporting index for the LATERAL lookup.
CREATE INDEX IF NOT EXISTS idx_reparatur_termine_claim_created
  ON public.reparatur_termine (claim_id, created_at DESC);

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
  NULLIF(TRIM(BOTH FROM (COALESCE(f.kunde_vorname, ''::text) || ' '::text) || COALESCE(f.kunde_nachname, ''::text)), ''::text) AS kunde_name,
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
  c.phase_override        AS override_phase,
  c.abrechnungsweg,
  c.reparatur_werkstatt_id,
  rt_latest.reparatur_status,
  rt_latest.reparatur_erledigt_am
FROM public.v_claim_full f
LEFT JOIN public.claims c ON c.id = f.id
LEFT JOIN LATERAL (
  SELECT rt.status AS reparatur_status, rt.erledigt_am AS reparatur_erledigt_am
  FROM public.reparatur_termine rt
  WHERE rt.claim_id = f.id
  ORDER BY rt.created_at DESC
  LIMIT 1
) rt_latest ON true
WHERE public.claim_sichtbar_fuer_aktuellen_user(f.id);

GRANT SELECT ON public.v_claim_workstate TO authenticated;
