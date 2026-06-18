-- CMM-49 Entity Plan-5 (4a): die 3 Views auf PURE-ENTITY flippen (personen statt COALESCE(p,cp)).
-- Voraussetzung fuer den flat-DROP (4e). Fail-loud: jedes Pattern wird vor dem Replace asserted
-- (RAISE EXCEPTION wenn fehlt) -> kein stiller Fehl-Flip. Reversibel (CREATE OR REPLACE).
-- Output value-neutral ausser den 2 synthetischen Seed-Rows (DB-verifiziert 0 Divergenz).

-- View 1: v_claim_parties_safe (p=personen, cp=claim_parties)
DO $$
DECLARE d text; i int;
  pairs text[] := ARRAY[
    'COALESCE(p.vorname, cp.vorname)','p.vorname',
    'COALESCE(p.nachname, cp.nachname)','p.nachname',
    'COALESCE(p.firma, cp.firma)','p.firma',
    'COALESCE(p.ist_gewerbe, cp.ist_gewerbe)','p.ist_gewerbe',
    'COALESCE(p.telefon, cp.telefon)','p.telefon',
    'COALESCE(p.email, cp.email)','p.email',
    'COALESCE(p.adresse_strasse, cp.adresse_strasse)','p.adresse_strasse',
    'COALESCE(p.geburtsdatum, cp.geburtsdatum)','p.geburtsdatum'
  ];
BEGIN
  d := pg_get_viewdef('public.v_claim_parties_safe'::regclass, true);
  FOR i IN 1..array_length(pairs,1) BY 2 LOOP
    IF position(pairs[i] in d) = 0 THEN RAISE EXCEPTION 'v_claim_parties_safe: pattern missing: %', pairs[i]; END IF;
    d := replace(d, pairs[i], pairs[i+1]);
  END LOOP;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_parties_safe AS ' || d;
END $$;

-- View 2: v_faelle_mit_aktuellem_termin (pe=personen, cp=claim_parties im cp_g-LATERAL)
DO $$
DECLARE d text; i int;
  pairs text[] := ARRAY[
    'COALESCE(pe.vorname, cp.vorname)','pe.vorname',
    'COALESCE(pe.nachname, cp.nachname)','pe.nachname',
    'COALESCE(pe.telefon, cp.telefon)','pe.telefon',
    'COALESCE(pe.adresse_strasse, cp.adresse_strasse)','pe.adresse_strasse',
    'COALESCE(pe.adresse_plz, cp.adresse_plz::text)','pe.adresse_plz',
    'COALESCE(pe.adresse_ort, cp.adresse_ort)','pe.adresse_ort'
  ];
BEGIN
  d := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  FOR i IN 1..array_length(pairs,1) BY 2 LOOP
    IF position(pairs[i] in d) = 0 THEN RAISE EXCEPTION 'v_faelle: pattern missing: %', pairs[i]; END IF;
    d := replace(d, pairs[i], pairs[i+1]);
  END LOOP;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || d;
END $$;

-- View 3: v_claim_full (kpe=personen, kcp=cp, kfi=firmen im kunde_p-LATERAL; gegner_name + gp-LATERAL)
DO $$
DECLARE d text; i int;
  pairs text[] := ARRAY[
    'COALESCE(kpe.vorname, kcp.vorname)','kpe.vorname',
    'COALESCE(kpe.nachname, kcp.nachname)','kpe.nachname',
    'COALESCE(kpe.telefon, kcp.telefon, kcp.mobil)','COALESCE(kpe.telefon, kpe.mobil)',
    'COALESCE(kpe.adresse_strasse, kcp.adresse_strasse)','kpe.adresse_strasse',
    'COALESCE(kpe.adresse_plz, kcp.adresse_plz::text)','kpe.adresse_plz',
    'COALESCE(kpe.adresse_ort, kcp.adresse_ort)','kpe.adresse_ort',
    'COALESCE(kfi.name, kcp.firma, kpe.firma)','COALESCE(kfi.name, kpe.firma)',
    ', gp.nachname) AS gegner_name',') AS gegner_name'
  ];
BEGIN
  d := pg_get_viewdef('public.v_claim_full'::regclass, true);
  FOR i IN 1..array_length(pairs,1) BY 2 LOOP
    IF position(pairs[i] in d) = 0 THEN RAISE EXCEPTION 'v_claim_full: pattern missing: %', pairs[i]; END IF;
    d := replace(d, pairs[i], pairs[i+1]);
  END LOOP;
  -- gp-LATERAL: vp.vorname + vp.nachname (NAMED refs auf gedroppte cp-cols) aus dem SELECT entfernen
  IF d !~ 'vp\.vorname,' THEN RAISE EXCEPTION 'v_claim_full: vp.vorname missing'; END IF;
  IF d !~ 'vp\.nachname,' THEN RAISE EXCEPTION 'v_claim_full: vp.nachname missing'; END IF;
  d := regexp_replace(d, '\s*vp\.vorname,', '', 'g');
  d := regexp_replace(d, '\s*vp\.nachname,', '', 'g');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || d;
END $$;
