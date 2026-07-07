-- Payment-Ledger Phase 2b: faelle_kunde_view surft auszahlung_kunde_* aus dem Ledger
-- (v_claim_payments) statt hardcoded NULL. Reiner Ledger-Read (auszahlung_kunde_* hatte nie
-- einen Cache -> kein COALESCE noetig). LEFT JOIN auf 1-Zeile-pro-Claim-Pivot: keine Zeilen-
-- Multiplikation, keine Zeilen-Verlust. Identische Spalten (Namen/Typen/Reihenfolge) -> CREATE
-- OR REPLACE-safe. DEFINER + Grants bleiben (CREATE OR REPLACE resettet sie nicht).
-- RLS-Kette verifiziert: postgres (View-Owner) hat bypassrls=true -> DEFINER-Parent sieht die
-- invoker-Pivot-Zahlung; Direkt-Query der Pivot bleibt RLS-gegated + anon-revoked.
CREATE OR REPLACE VIEW public.faelle_kunde_view AS
 SELECT fall_id AS id,
    fall_status AS status,
    hergang_kunde_text AS schadens_beschreibung,
    schadentag AS schadens_datum,
    schadenort_adresse AS schadens_adresse,
    schadens_plz,
    schadens_ort,
    kennzeichen,
    fahrzeug_hersteller_raw AS fahrzeug_hersteller,
    fahrzeug_modell,
    fahrzeug_baujahr,
    p.kunde_ist::numeric(10,2) AS auszahlung_kunde_betrag,
    p.kunde_am::timestamp with time zone AS auszahlung_kunde_eingegangen_am,
    auszahlung_zahlungsweg,
    eskalation_tag_14_ergebnis,
    eskalation_tag_14_ergebnis_am,
    eskalation_tag_21_ergebnis,
    eskalation_tag_21_ergebnis_am,
    eskalation_tag_28_ergebnis,
    eskalation_tag_28_ergebnis_am,
    nachbesichtigung_status,
    nachbesichtigung_termin_datum,
    nachbesichtigung_kunde_termin_vorschlaege,
    nachbesichtigung_kunde_termin_eingereicht_am,
    nachbesichtigung_sv_konfrontation_gewuenscht,
    vs_quote_prozent,
    vs_quote_grund,
    vs_quote_akzeptiert_am,
    vs_quote_betrag_ausgezahlt,
    vs_reaktion_typ,
    vs_reaktion_am,
    besichtigungsort_adresse,
    abgeschlossen_am,
    kunde_id,
    sv_id,
    claim_nummer,
    main_phase,
    sub_phase
   FROM v_claim_base base
     LEFT JOIN v_claim_payments p ON p.claim_id = base.claim_id;
