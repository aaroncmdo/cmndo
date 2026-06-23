-- Kanonische SV-Lead-Quelle WP-A Task 2: sv_lead_upsert (initiale Version).
-- Einziger idempotenter Schreibweg in sv_leads. Dedup: dat_id wenn vorhanden, sonst (normalized_name, plz).
-- Pflicht (NOT NULL ohne Default): name, adresse, lat, lng. (Coalesce-Enrichment folgt in 20260623162624.)
CREATE OR REPLACE FUNCTION public.sv_lead_upsert(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_dat text := nullif(p->>'dat_id','');
BEGIN
  IF v_dat IS NOT NULL THEN
    INSERT INTO public.sv_leads (name, firma, vorname, nachname, adresse, plz, ort, lat, lng,
      telefon, email, dat_id, dat_expert_nr, qualifikationen, paket_umkreis_km, quelle, ist_aktiv, claim_status, aktualisiert_am)
    VALUES (p->>'name', p->>'firma', p->>'vorname', p->>'nachname', p->>'adresse', p->>'plz', p->>'ort',
      (p->>'lat')::float8, (p->>'lng')::float8, p->>'telefon', p->>'email', v_dat, p->>'dat_expert_nr',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'qualifikationen','[]'::jsonb))), coalesce((p->>'paket_umkreis_km')::int,15),
      coalesce(p->>'quelle','admin'), coalesce((p->>'ist_aktiv')::bool,true), 'offen', now())
    ON CONFLICT (dat_id) DO UPDATE SET name=excluded.name, firma=excluded.firma, vorname=excluded.vorname,
      nachname=excluded.nachname, adresse=excluded.adresse, plz=excluded.plz, ort=excluded.ort,
      lat=excluded.lat, lng=excluded.lng, telefon=excluded.telefon, email=excluded.email,
      dat_expert_nr=excluded.dat_expert_nr, qualifikationen=excluded.qualifikationen,
      paket_umkreis_km=excluded.paket_umkreis_km, aktualisiert_am=now()
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.sv_leads (name, firma, vorname, nachname, adresse, plz, ort, lat, lng,
      telefon, email, qualifikationen, paket_umkreis_km, quelle, ist_aktiv, claim_status, aktualisiert_am)
    VALUES (p->>'name', p->>'firma', p->>'vorname', p->>'nachname', p->>'adresse', p->>'plz', p->>'ort',
      (p->>'lat')::float8, (p->>'lng')::float8, p->>'telefon', p->>'email',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'qualifikationen','[]'::jsonb))), coalesce((p->>'paket_umkreis_km')::int,15),
      coalesce(p->>'quelle','admin'), coalesce((p->>'ist_aktiv')::bool,true), 'offen', now())
    ON CONFLICT (normalized_name, plz) WHERE dat_id IS NULL DO UPDATE SET firma=excluded.firma,
      vorname=excluded.vorname, nachname=excluded.nachname, adresse=excluded.adresse, ort=excluded.ort,
      lat=excluded.lat, lng=excluded.lng, telefon=excluded.telefon, email=excluded.email,
      qualifikationen=excluded.qualifikationen, paket_umkreis_km=excluded.paket_umkreis_km, aktualisiert_am=now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
