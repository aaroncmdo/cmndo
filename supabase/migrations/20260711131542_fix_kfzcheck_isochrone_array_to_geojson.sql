-- Data repair: sachverstaendige 9364985e (KFZcheck) hat isochrone_polygon als rohes
-- [{lat,lng},...]-Array gespeichert statt als GeoJSON {type:'Polygon',coordinates:[[[lng,lat],...]]}.
-- Der alte per-SV-Halo-Renderer (sv-isos-pro FeatureCollection) verwirft die GANZE Quelle wegen
-- des einen invaliden Features -> keine Isochrone sichtbar (nur Avatare). Der neue Union-Pfad
-- (parseIsochrone) toleriert das Array bereits; dieser Fix repariert die DB-Quelle deterministisch
-- (echte NRW-Form bleibt, nur Format), sodass ALLE Reader (inkl. alte Builds) rendern.
-- Idempotent: nur wenn noch Array. No-op auf frischen DBs (Row-ID existiert dort nicht).
update public.sachverstaendige s
set isochrone_polygon = jsonb_build_object(
  'type', 'Polygon',
  'coordinates', jsonb_build_array( sub.arr )
)
from (
  select x.id,
    case when a.arr->0 = a.arr->-1 then a.arr else a.arr || jsonb_build_array(a.arr->0) end as arr
  from public.sachverstaendige x
  cross join lateral (
    select jsonb_agg(jsonb_build_array((e->>'lng')::float8, (e->>'lat')::float8) order by ord) as arr
    from jsonb_array_elements(x.isochrone_polygon) with ordinality as t(e, ord)
  ) a
  where x.id = '9364985e-3fa2-46cc-9189-96bc531b4d61'
    and jsonb_typeof(x.isochrone_polygon) = 'array'
) sub
where s.id = sub.id;
