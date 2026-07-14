-- Global-Suche Slice 1, Task 2: search_global RPC (SECURITY INVOKER, pg_trgm, role-gated).
-- HINWEIS: diese erste Fassung hatte einen ambiguous-"id"-Bug (RETURNS-TABLE-OUT-Param `id`
-- kollidiert mit profiles.id im WHERE) -> in 20260714142103 gefixt. Als-appliziert erhalten
-- fuer reproduzierbare Historie (CREATE OR REPLACE legt fehlerfrei an, Fehler erst zur Laufzeit).
CREATE OR REPLACE FUNCTION public.search_global(q text, limit_per_type int DEFAULT 6)
RETURNS TABLE (entity_type text, id uuid, label text, sub text, status text, score real)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_role user_role;
BEGIN
  IF length(coalesce(q,'')) < 2 THEN RETURN; END IF;
  SELECT rolle INTO v_role FROM profiles WHERE id = auth.uid();

  RETURN QUERY SELECT * FROM (
    SELECT 'claim'::text, c.id,
           c.claim_nummer::text,
           coalesce(c.schadenort_ort, c.polizei_aktenzeichen)::text,
           c.operative_status::text,
           GREATEST(similarity(coalesce(c.claim_nummer,''), q),
                    similarity(coalesce(c.schadenort_ort,''), q),
                    similarity(coalesce(c.polizei_aktenzeichen,''), q))::real AS s
    FROM claims c
    WHERE c.claim_nummer % q OR c.schadenort_ort % q OR c.polizei_aktenzeichen % q
    ORDER BY s DESC LIMIT limit_per_type
  ) x;

  RETURN QUERY SELECT * FROM (
    SELECT 'claim'::text, c.id, v.kennzeichen_aktuell::text, c.claim_nummer::text,
           c.operative_status::text, similarity(coalesce(v.kennzeichen_normalized,''), q)::real AS s
    FROM vehicles v JOIN claims c ON c.vehicle_id = v.id
    WHERE v.kennzeichen_normalized % q
    ORDER BY s DESC LIMIT limit_per_type
  ) x;

  RETURN QUERY SELECT * FROM (
    SELECT 'claim'::text, c.id, concat_ws(' ', p.vorname, p.nachname)::text, c.claim_nummer::text,
           c.operative_status::text,
           GREATEST(similarity(coalesce(p.vorname,''), q),
                    similarity(coalesce(p.nachname,''), q),
                    similarity(coalesce(p.firma,''), q))::real AS s
    FROM personen p
    JOIN claim_parties cp ON cp.person_id = p.id AND cp.ist_aktiv
    JOIN claims c ON c.id = cp.claim_id
    WHERE p.vorname % q OR p.nachname % q OR p.firma % q
    ORDER BY s DESC LIMIT limit_per_type
  ) x;

  IF v_role = ANY(ARRAY['admin','kundenbetreuer','dispatch','leadbearbeiter','makler']::user_role[]) THEN
    RETURN QUERY SELECT * FROM (
      SELECT 'lead'::text, l.id, concat_ws(' ', l.vorname, l.nachname)::text,
             coalesce(l.kennzeichen, l.lead_nummer)::text, l.status::text,
             GREATEST(similarity(coalesce(l.vorname,''), q),
                      similarity(coalesce(l.nachname,''), q),
                      similarity(coalesce(l.kennzeichen,''), q),
                      similarity(coalesce(l.lead_nummer,''), q))::real AS s
      FROM leads l
      WHERE l.vorname % q OR l.nachname % q OR l.kennzeichen % q OR l.lead_nummer % q
      ORDER BY s DESC LIMIT limit_per_type
    ) x;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_global(text, int) TO authenticated;
