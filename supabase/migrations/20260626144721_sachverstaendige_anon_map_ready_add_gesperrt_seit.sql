-- SV-Onboarding-Audit (2026-06-26): Die anon-RLS-Policy fuer die oeffentliche
-- /gutachter-finden Mapbox-Marker gatete verifiziert + ist_aktiv + geloescht_am + geo,
-- aber NICHT gesperrt_seit. Sperre (deactivateGutachter) laesst ist_aktiv=true stehen
-- (Flag ist fuer den Onboarding-Flow reserviert) -> ein gesperrter, sonst map-ready SV
-- blieb auf der oeffentlichen Karte sichtbar. Praeventive Haertung (aktuell 0 betroffen).
-- Der Gate gehoert in die Policy, da der anon-Read nur 9 Spalten-Grants hat und ein
-- App-seitiger .eq()/.is()-Filter auf nicht-granted Spalten "permission denied" wuerfe.
ALTER POLICY sachverstaendige_anon_select_map_ready ON public.sachverstaendige
USING (
  (verifiziert = true)
  AND (ist_aktiv = true)
  AND (geloescht_am IS NULL)
  AND (gesperrt_seit IS NULL)
  AND (standort_lat IS NOT NULL)
  AND (standort_lng IS NOT NULL)
  AND (isochrone_polygon IS NOT NULL)
);

COMMENT ON POLICY sachverstaendige_anon_select_map_ready ON public.sachverstaendige IS
'Marketing-Page /gutachter-finden braucht anonymen Lese-Zugriff fuer die Mapbox-Marker. Filter stellt sicher dass nur map-ready Zeilen sichtbar sind (verifiziert + aktiv + nicht gesperrt + geo + isochrone + nicht geloescht). gesperrt_seit ergaenzt 2026-06-26 (SV-Onboarding-Audit): Sperre laesst ist_aktiv=true -> sonst blieben gesperrte SVs auf der Public-Map.';
