-- SV-Live-Ops Chunk 1: eine Zeile pro SV mit Standort, Isochrone, Auslastung +
-- jüngster Live-Position (sv_live_location) + jüngstem heading (sv_live_position).
-- Wird server-seitig via createAdminClient() gelesen + im Loader role-scoped;
-- daher REVOKE fuer anon/authenticated (kein Direktzugriff), GRANT nur service_role.
CREATE OR REPLACE VIEW public.v_live_ops_sv AS
SELECT s.id,
       s.gutachter_typ,
       s.verifiziert,
       s.paket,
       s.paket_faelle_genutzt,
       s.paket_faelle_gesamt,
       s.standort_lat,
       s.standort_lng,
       s.isochrone_polygon,
       s.portal_zugang_freigeschaltet,
       s.gesperrt_seit,
       s.urlaub_von,
       s.urlaub_bis,
       s.live_tracking_enabled,
       p.vorname,
       p.nachname,
       p.avatar_url,
       loc.lat        AS live_lat,
       loc.lng        AS live_lng,
       loc.updated_at AS live_updated_at,
       pos.heading    AS live_heading
FROM public.sachverstaendige s
JOIN public.profiles p ON p.id = s.profile_id
LEFT JOIN LATERAL (
  SELECT l.lat, l.lng, l.updated_at
  FROM public.sv_live_location l
  WHERE l.sv_id = s.id
  ORDER BY l.updated_at DESC
  LIMIT 1
) loc ON true
LEFT JOIN LATERAL (
  SELECT pp.heading
  FROM public.sv_live_position pp
  WHERE pp.sv_id = s.id
  ORDER BY pp.captured_at DESC
  LIMIT 1
) pos ON true
WHERE s.geloescht_am IS NULL;

REVOKE ALL ON public.v_live_ops_sv FROM anon, authenticated;
GRANT SELECT ON public.v_live_ops_sv TO service_role;
