-- Fix: 8 SVs hatten isochrone_polygon als Array von {lat,lng}-Objects gespeichert
-- statt als GeoJSON-Polygon-Object. Mapbox lehnte sie ab mit
-- "Input data is not a valid GeoJSON object" → Iso-Halos rendern nicht +
-- Console-Error auf /gutachter-finden.
--
-- Migration: array [{lat,lng}, ...] → {type:'Polygon', coordinates:[[ [lng,lat], ... ]]}
-- Ring-Schluss: letztes Element == erstes (GeoJSON-Pflicht für LinearRing).
--
-- Diese Migration wurde am 2026-05-15 zunächst manuell via MCP execute_sql
-- gegen Production gefahren (Bug-Befund im Vollstrecke-Smoke). Das File
-- existiert als Idempotenz-Marker für db-reset/db-push und Repo-Reproduzierbarkeit.
-- WHERE-Clause schliesst bereits korrekte Records aus → safe idempotent.

WITH targets AS (
  SELECT id
  FROM public.sachverstaendige
  WHERE isochrone_polygon IS NOT NULL
    AND jsonb_typeof(isochrone_polygon::jsonb) = 'array'
),
ring AS (
  SELECT s.id,
    jsonb_agg(
      jsonb_build_array((pt->>'lng')::numeric, (pt->>'lat')::numeric)
      ORDER BY ord
    ) AS pts
  FROM public.sachverstaendige s
  JOIN targets t ON t.id = s.id
  CROSS JOIN LATERAL jsonb_array_elements(s.isochrone_polygon::jsonb) WITH ORDINALITY AS pt(pt, ord)
  GROUP BY s.id
),
closed AS (
  SELECT id,
    CASE
      WHEN pts->0 = pts->(jsonb_array_length(pts) - 1) THEN pts
      ELSE pts || jsonb_build_array(pts->0)
    END AS pts
  FROM ring
)
UPDATE public.sachverstaendige s
SET isochrone_polygon = jsonb_build_object(
  'type', 'Polygon',
  'coordinates', jsonb_build_array(c.pts)
)
FROM closed c
WHERE s.id = c.id;

-- Verifikation: alle isochrone_polygon-Werte sind jetzt {type:'Polygon', coordinates:[...]}.
-- SELECT jsonb_typeof(isochrone_polygon::jsonb), count(*)
--   FROM public.sachverstaendige
--  WHERE isochrone_polygon IS NOT NULL GROUP BY 1;
-- → erwartet: nur Zeilen mit json_type='object'.
