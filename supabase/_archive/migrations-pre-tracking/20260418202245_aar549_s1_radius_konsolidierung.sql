-- AAR-549 S1: Radius-Felder konsolidieren
-- paket_umkreis_km bleibt als kanonische Quelle.
-- radius_km + paket_radius_km werden gedroppt.
--
-- Backfill: bei Divergenz den höheren Wert übernehmen (GREATEST-Regel).
-- Schmidt Gutachter GmbH hat radius_km=40 vs paket_umkreis_km=20 — nehmen wir 40.

UPDATE sachverstaendige
SET paket_umkreis_km = GREATEST(COALESCE(radius_km, 0), COALESCE(paket_umkreis_km, 0))
WHERE (radius_km IS DISTINCT FROM paket_umkreis_km) AND radius_km IS NOT NULL;

ALTER TABLE sachverstaendige DROP COLUMN radius_km;
ALTER TABLE sachverstaendige DROP COLUMN paket_radius_km;

COMMENT ON COLUMN sachverstaendige.paket_umkreis_km IS 'Einsatzradius in km — kanonische Quelle (ersetzt radius_km, paket_radius_km seit AAR-549 S1).';;
