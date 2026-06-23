-- Kanonische SV-Lead-Quelle WP-A Task 2 (Refinement): Coalesce-Enrichment.
-- Smoke deckte Daten-Verlust auf: ein partieller (geo-only) Re-Upsert wischte qualifikationen.
-- Fix: Kern-Felder (name/adresse/plz/ort/lat/lng/umkreis) overwrite; Enrichment
-- (firma/vorname/nachname/telefon/email/dat_expert_nr/qualifikationen) COALESCE (nur wenn neu nicht leer)
-- -> ein DAT-/Geo-Sync ohne Quals/Kontakt wischt das vorhandene Enrichment NICHT.
CREATE OR REPLACE FUNCTION public.sv_lead_upsert(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_dat text := nullif(p->>'dat_id','');
  v_quals text[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'qualifikationen','[]'::jsonb)));
BEGIN
  IF v_dat IS NOT NULL THEN
    INSERT INTO public.sv_leads (name, firma, vorname, nachname, adresse, plz, ort, lat, lng,
      telefon, email, dat_id, dat_expert_nr, qualifikationen, paket_umkreis_km, quelle, ist_aktiv, claim_status, aktualisiert_am)
    VALUES (p->>'name', p->>'firma', p->>'vorname', p->>'nachname', p->>'adresse', p->>'plz', p->>'ort',
      (p->>'lat')::float8, (p->>'lng')::float8, p->>'telefon', p->>'email', v_dat, p->>'dat_expert_nr',
      v_quals, coalesce((p->>'paket_umkreis_km')::int,15),
      coalesce(p->>'quelle','admin'), coalesce((p->>'ist_aktiv')::bool,true), 'offen', now())
    ON CONFLICT (dat_id) DO UPDATE SET name=excluded.name, adresse=excluded.adresse, plz=excluded.plz,
      ort=excluded.ort, lat=excluded.lat, lng=excluded.lng, paket_umkreis_km=excluded.paket_umkreis_km,
      firma=coalesce(nullif(excluded.firma,''), sv_leads.firma),
      vorname=coalesce(nullif(excluded.vorname,''), sv_leads.vorname),
      nachname=coalesce(nullif(excluded.nachname,''), sv_leads.nachname),
      telefon=coalesce(nullif(excluded.telefon,''), sv_leads.telefon),
      email=coalesce(nullif(excluded.email,''), sv_leads.email),
      dat_expert_nr=coalesce(nullif(excluded.dat_expert_nr,''), sv_leads.dat_expert_nr),
      qualifikationen=CASE WHEN array_length(excluded.qualifikationen,1)>0 THEN excluded.qualifikationen ELSE sv_leads.qualifikationen END,
      aktualisiert_am=now()
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.sv_leads (name, firma, vorname, nachname, adresse, plz, ort, lat, lng,
      telefon, email, qualifikationen, paket_umkreis_km, quelle, ist_aktiv, claim_status, aktualisiert_am)
    VALUES (p->>'name', p->>'firma', p->>'vorname', p->>'nachname', p->>'adresse', p->>'plz', p->>'ort',
      (p->>'lat')::float8, (p->>'lng')::float8, p->>'telefon', p->>'email',
      v_quals, coalesce((p->>'paket_umkreis_km')::int,15),
      coalesce(p->>'quelle','admin'), coalesce((p->>'ist_aktiv')::bool,true), 'offen', now())
    ON CONFLICT (normalized_name, plz) WHERE dat_id IS NULL DO UPDATE SET adresse=excluded.adresse,
      ort=excluded.ort, lat=excluded.lat, lng=excluded.lng, paket_umkreis_km=excluded.paket_umkreis_km,
      firma=coalesce(nullif(excluded.firma,''), sv_leads.firma),
      vorname=coalesce(nullif(excluded.vorname,''), sv_leads.vorname),
      nachname=coalesce(nullif(excluded.nachname,''), sv_leads.nachname),
      telefon=coalesce(nullif(excluded.telefon,''), sv_leads.telefon),
      email=coalesce(nullif(excluded.email,''), sv_leads.email),
      qualifikationen=CASE WHEN array_length(excluded.qualifikationen,1)>0 THEN excluded.qualifikationen ELSE sv_leads.qualifikationen END,
      aktualisiert_am=now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
