SELECT
  json_build_object(
    'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.plz_geo'::regclass),
    'row_count', (SELECT COUNT(*) FROM plz_geo),
    'plz_42853', (SELECT row_to_json(p) FROM (SELECT plz, lat, lng, ort FROM plz_geo WHERE plz = '42853') p),
    'policies', (SELECT json_agg(json_build_object(
      'policy', polname,
      'cmd', polcmd,
      'roles', (SELECT array_agg(rolname) FROM pg_roles WHERE oid = ANY(polroles))::text[]
    )) FROM pg_policy WHERE polrelid = 'public.plz_geo'::regclass)
  ) AS info;
