-- #2 Layer A (letzter Baustein): v_claim_workstate liest abrechnungsweg nicht mehr aus der
-- ROH-Spalte claims.abrechnungsweg (c.abrechnungsweg), sondern aus der bereits-derived
-- Upstream-View v_claim_full (f.abrechnungsweg, Mig 20260713120609). Das war der EINZIGE
-- verbleibende pg_depend-Blocker fuer DROP COLUMN claims.abrechnungsweg (danach 0 Deps).
-- Shape-preserving: Spalte 'abrechnungsweg' bleibt an gleicher Position + Typ (text), nur
-- die Quelle wechselt c->f. Wert konsistent mit v_claim_base/full/phase (alle pure-derived).
-- Rest byte-identisch zur Ist-Def (md5 f8cb129a01ea2a60ac7d4ab89915cda5 vorher verifiziert).
-- reloptions=(none) wie alle Sibling-Views; RLS via claim_sichtbar_fuer_aktuellen_user (SECDEF).
CREATE OR REPLACE VIEW public.v_claim_workstate AS
 SELECT f.id AS claim_id,
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
    c.notizen AS edit_notizen,
    c.interne_notizen AS edit_interne_notizen,
    c.schadens_hoehe_netto AS edit_schadens_hoehe_netto,
    c.phase_override AS override_phase,
    f.abrechnungsweg,
    c.reparatur_werkstatt_id,
    rt_latest.reparatur_status,
    rt_latest.reparatur_erledigt_am
   FROM v_claim_full f
     LEFT JOIN claims c ON c.id = f.id
     LEFT JOIN LATERAL ( SELECT rt.status AS reparatur_status,
            rt.erledigt_am AS reparatur_erledigt_am
           FROM reparatur_termine rt
          WHERE rt.claim_id = f.id
          ORDER BY rt.created_at DESC
         LIMIT 1) rt_latest ON true
  WHERE claim_sichtbar_fuer_aktuellen_user(f.id);
