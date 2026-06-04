-- CMM-49 P1b: claims-Homes fuer die belegten faelle-only-Spalten, die v_faelle_mit_aktuellem_termin-
-- Consumer wirklich lesen (Fallakte/Stepper/Isochrone). Additiv + Backfill aus faelle. Claim-Level-Daten.
-- Verifiziert: mw/konv/lat-Backfill je 0 diff vs faelle.
ALTER TABLE public.claims
  ADD COLUMN mietwagen_kanzlei_informiert boolean,
  ADD COLUMN mietwagen_kanzlei_informiert_am timestamptz,
  ADD COLUMN konvertiert_am timestamptz,
  ADD COLUMN kunde_lat numeric,
  ADD COLUMN kunde_lng numeric;

UPDATE public.claims c SET
  mietwagen_kanzlei_informiert = f.mietwagen_kanzlei_informiert,
  mietwagen_kanzlei_informiert_am = f.mietwagen_kanzlei_informiert_am,
  konvertiert_am = f.konvertiert_am,
  kunde_lat = f.kunde_lat,
  kunde_lng = f.kunde_lng
FROM public.faelle f
WHERE f.claim_id = c.id;

COMMENT ON COLUMN public.claims.konvertiert_am IS 'CMM-49: Lead->Fall-Konversionszeitpunkt (von faelle.konvertiert_am migriert).';
COMMENT ON COLUMN public.claims.mietwagen_kanzlei_informiert IS 'CMM-49: Mietwagen-Kanzlei-Info-Flag (von faelle migriert).';
COMMENT ON COLUMN public.claims.kunde_lat IS 'CMM-49: Kunde-Koordinate lat (von faelle migriert; Isochrone-Fallback).';
COMMENT ON COLUMN public.claims.kunde_lng IS 'CMM-49: Kunde-Koordinate lng (von faelle migriert; Isochrone-Fallback).';
