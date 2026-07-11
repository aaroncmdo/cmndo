-- v_claim_listing: kunde-Name jetzt kanonisch aus v_claim_kunde_name (geschaedigter-Party),
-- profiles nur noch als Fallback (nie-leer). Vorher war die kunde-Projektion rein profiles-basiert
-- (LEFT JOIN profiles ON id = geschaedigter_user_id) -> 44 von 48 Claims zeigten einen LEEREN
-- Kunde-Namen, weil leads-/party-originierte Claims kein profiles.anzeigename haben. Die Detail-
-- Views (v_claim_full/base) zeigen dagegen den geschaedigter-Party-Namen -> Listen-Name != Detail-Name.
--
-- Danach (prod-verifiziert, predicate-frei gemessen): 14 leer (nur wo weder Party-Name noch
-- profiles-Name existiert), 0 Regression (neue Leer-Menge ist strikte Teilmenge der alten),
-- 30 Claims zeigen jetzt ihren echten, mit dem Detail deckungsgleichen Namen.
--
-- Shape/Spalten/Reihenfolge/Praedikat identisch zur vorherigen Definition; NUR die drei
-- kunde_*-Ausdruecke (COALESCE(helper, profiles)) + ein LEFT JOIN v_claim_kunde_name kamen hinzu.
create or replace view public.v_claim_listing as
 SELECT claim_id,
    claim_nummer,
    status,
    schadentag,
    kunden_konstellation,
    created_at,
    updated_at,
    fall_id,
    sv_id,
    faelle_kundenbetreuer_id,
    claim_kundenbetreuer_id,
    service_typ,
    kunde_anzeigename,
    kunde_vorname,
    kunde_nachname,
    kennzeichen,
    main_phase,
    sub_phase
   FROM ( SELECT c.id AS claim_id,
            c.claim_nummer,
            c.status,
            c.schadentag,
            c.kunden_konstellation,
            c.created_at,
            c.updated_at,
            fb.fall_id,
            c.sv_id,
            c.kundenbetreuer_id AS faelle_kundenbetreuer_id,
            c.kundenbetreuer_id AS claim_kundenbetreuer_id,
            c.service_typ,
            COALESCE(kn.kunde_anzeigename, p.anzeigename) AS kunde_anzeigename,
            COALESCE(kn.kunde_vorname, p.vorname) AS kunde_vorname,
            COALESCE(kn.kunde_nachname, p.nachname) AS kunde_nachname,
            v.kennzeichen_aktuell AS kennzeichen,
            vcp.main_phase,
            vcp.sub_phase
           FROM claims c
             LEFT JOIN faelle_claim_bridge fb ON fb.claim_id = c.id
             LEFT JOIN profiles p ON p.id = c.geschaedigter_user_id
             LEFT JOIN vehicles v ON v.id = c.vehicle_id
             LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id
             LEFT JOIN v_claim_kunde_name kn ON kn.claim_id = c.id) sub
  WHERE claim_sichtbar_fuer_aktuellen_user(claim_id);
