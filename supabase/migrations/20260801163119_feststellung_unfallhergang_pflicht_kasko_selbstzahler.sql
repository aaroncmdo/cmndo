-- Schaden-Beschreibung (unfallhergang) im Feststellungs-Gate der Werkstatt-Reparatur-Wege
-- (Kasko + Selbstzahler) erzwingen. Vorher {kennzeichen, schadentyp} -> unfallhergang war
-- optional (pflicht=false + nicht im erhebt_felder-Gate), sodass die Werkstatt im Extremfall
-- weder Beschreibung noch Fotos hatte. Haftpflicht hatte unfallhergang bereits im Gate -> das
-- ist die Konsistenz-Angleichung. Aaron 01.08.: mind. eine inhaltliche Schaden-Grundlage
-- (Beschreibung ODER Fotos) soll Pflicht sein; Beschreibung gewaehlt (flow-nativ ueber das
-- erhebt_felder-Gate erzwingbar; Fotos kommen erst nach der Konvertierung im Kunde-Portal).
-- Rein DB-driven (flow-szenarien.ts liest das Gate live), kein Code-Change.
UPDATE flow_szenario_steps
SET erhebt_felder = ARRAY['kennzeichen','schadentyp','unfallhergang']::text[]
WHERE step_id = 'feststellung'
  AND szenario_id IN (
    SELECT id FROM flow_szenarien
    WHERE schuldfrage = 'eigenverantwortung' AND eigene_versicherung IN ('ja','nein')
  );
