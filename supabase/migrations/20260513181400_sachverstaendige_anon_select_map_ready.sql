-- Anon-SELECT-Policy für die Marketing-Page /gutachter-finden, damit echte SVs
-- als Marker auf der Mapbox-Karte erscheinen können. Aufgefallen im CJ-Smoke
-- am 13.05.2026 — 7 SVs in DB mit verifiziert/aktiv/geo/iso, aber Map zeigt
-- nur die 62 sv_leads-Demos weil anon-SELECT geblockt war.

CREATE POLICY sachverstaendige_anon_select_map_ready ON public.sachverstaendige
  FOR SELECT TO anon
  USING (
    verifiziert = true
    AND ist_aktiv = true
    AND geloescht_am IS NULL
    AND standort_lat IS NOT NULL
    AND standort_lng IS NOT NULL
    AND isochrone_polygon IS NOT NULL
  );

COMMENT ON POLICY sachverstaendige_anon_select_map_ready ON public.sachverstaendige IS
  'Marketing-Page /gutachter-finden braucht anonymen Lese-Zugriff für die Mapbox-Marker. Filter stellt sicher dass nur map-ready Zeilen sichtbar sind.';
