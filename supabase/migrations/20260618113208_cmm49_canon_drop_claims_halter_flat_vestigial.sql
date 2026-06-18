-- CMM-49 Claim-Kanonisierung (CMM-67 halter): claims.halter_* sind vestigiale Flat-Duplikate.
-- Die Halter-Daten leben in der halter-Party (claim_parties ist_halter=true) -> personen;
-- v_claim_full.halter_* sourct bereits aus dieser Party (halter_p-LATERAL + eigenes berechnetes
-- halter_name), NICHT aus claims. Verifiziert (18.06.): 0 View-Dependencies auf claims.halter_*
-- (pg_depend), 0/84 Zeilen populated, 0 Code-Reader (alle .halter_*-Reads sind lead.halter_* /
-- extracted.halter_* / v_claim_full-Party-Source), 0 claims-Writer (kein from('claims')...halter_*).
-- Post-Drop verifiziert: beide Views resolven (84/84); v_claim_full.halter_name liefert weiter 80
-- Werte (aus der Party berechnet) -> Reader unveraendert, wertneutral.
-- halter_name ist GENERATED (NULLIF(TRIM(halter_vorname||' '||halter_nachname))) -> ZUERST droppen,
-- dann die Basis-Spalten. KEIN CASCADE (Safety-Net; Drop ist ohne CASCADE durchgelaufen ->
-- bestaetigt 0 weitere Dependencies). halter_ungleich_fahrer bleibt (separate generated-Spalte).
ALTER TABLE public.claims
  DROP COLUMN halter_name,
  DROP COLUMN halter_vorname,
  DROP COLUMN halter_nachname,
  DROP COLUMN halter_strasse,
  DROP COLUMN halter_plz,
  DROP COLUMN halter_stadt,
  DROP COLUMN halter_telefon,
  DROP COLUMN halter_email,
  DROP COLUMN halter_geburtsdatum;
