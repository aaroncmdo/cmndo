-- RLS-Haertung Schritt 2b — Identity-Cross-Compare: kanzlei-Zweig auf echtes Mandat (kanzlei_faelle)
-- statt service_typ='komplett'. Folgt Mig 20260727120255 (is_kanzlei_mandat): der Check-Fixture
-- erwartete die ALTE komplett-Sicht -> UNTER-Exposure-Fehlalarm (kanzlei sah 15/20 komplett-Claims).
-- Jetzt: X = Claim mit kanzlei_faelle-Mandat fuer u_kanzlei's Kanzlei (Positiv: sieht sein Mandat),
-- Y = komplett-Claim OHNE Mandat + nicht-Party (Negativ = genau der Cross-Tenant-Fix). Der Fixture-User
-- (bbbb1111, kanzlei_id 69ee5457) hat bereits 2 kanzlei_faelle-Mandate -> KEIN Daten-Seed noetig.
-- Alle anderen Rollen-Zweige byte-verbatim aus 20260629170133.
CREATE OR REPLACE FUNCTION public.audit_claim_view_identity()
 RETURNS TABLE(rolle text, view_name text, befund text)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  u_kunde     uuid := '113aebe5-0630-4753-809a-6756df5ba432';
  u_sv        uuid := '25a8c28e-b85a-4769-94d4-920e47f64079';
  u_kb        uuid := '59bdb155-e283-4fd1-a4ca-222f924a0efa';
  u_kanzlei   uuid := 'bbbb1111-0000-4000-8000-000000000010';
  u_makler    uuid := 'bbbb2222-0000-4000-8000-000000000020';
  u_admin     uuid := 'bdfe432b-250e-4dec-8bdd-f5d6ac04d910';
  u_dispatch  uuid := 'aa000002-0000-0000-0000-000000000002';
  u_werkstatt uuid := 'd5c2940d-5ddd-48c6-8624-97633fd37edf';
  sv_sach uuid;
  x_kunde uuid; y_kunde uuid; x_sv uuid; y_sv uuid; x_kb uuid; y_kb uuid;
  x_kanzlei uuid; y_kanzlei uuid; x_makler uuid; y_makler uuid; x_werkstatt uuid; y_werkstatt uuid;
  r record; v record; sieht boolean;
BEGIN
  SELECT id INTO sv_sach FROM sachverstaendige WHERE profile_id = u_sv;

  SELECT id INTO x_kunde FROM claims WHERE geschaedigter_user_id = u_kunde LIMIT 1;
  SELECT c.id INTO y_kunde FROM claims c WHERE c.geschaedigter_user_id IS DISTINCT FROM u_kunde
    AND NOT EXISTS (SELECT 1 FROM claim_parties p WHERE p.claim_id=c.id AND p.user_id=u_kunde AND p.ist_aktiv) LIMIT 1;

  SELECT c.id INTO x_sv FROM claims c WHERE c.sv_id = sv_sach LIMIT 1;
  SELECT c.id INTO y_sv FROM claims c WHERE c.sv_id IS DISTINCT FROM sv_sach
    AND NOT EXISTS (SELECT 1 FROM claim_parties p WHERE p.claim_id=c.id AND p.user_id=u_sv AND p.ist_aktiv) LIMIT 1;

  SELECT c.id INTO x_kb FROM claims c WHERE c.kundenbetreuer_id = u_kb LIMIT 1;
  SELECT c.id INTO y_kb FROM claims c WHERE c.kundenbetreuer_id IS NOT NULL AND c.kundenbetreuer_id <> u_kb LIMIT 1;

  -- kanzlei: Sicht = echtes kanzlei_faelle-Mandat (Mig 20260727120255), NICHT mehr service_typ='komplett'.
  -- X = Claim mit Mandat fuer u_kanzlei's Kanzlei (Positiv: sieht sein Mandat); Y = komplett-Claim OHNE
  -- Mandat + nicht-Party (Negativ: sieht komplett-Fremdclaim NICHT mehr = der Cross-Tenant-Fix).
  SELECT c.id INTO x_kanzlei FROM claims c WHERE EXISTS (
      SELECT 1 FROM kanzlei_faelle kf JOIN profiles p ON p.id = u_kanzlei
      WHERE p.kanzlei_id = kf.kanzlei_id AND (kf.claim_id = c.id OR kf.fall_id = c.id)) LIMIT 1;
  SELECT c.id INTO y_kanzlei FROM claims c WHERE c.service_typ='komplett'
    AND c.geschaedigter_user_id IS DISTINCT FROM u_kanzlei
    AND NOT EXISTS (SELECT 1 FROM kanzlei_faelle kf JOIN profiles p ON p.id = u_kanzlei
        WHERE p.kanzlei_id = kf.kanzlei_id AND (kf.claim_id = c.id OR kf.fall_id = c.id))
    AND NOT EXISTS (SELECT 1 FROM claim_parties p WHERE p.claim_id=c.id AND p.user_id=u_kanzlei AND p.ist_aktiv) LIMIT 1;

  SELECT c.id INTO x_makler FROM claims c WHERE
     c.makler_id IN (SELECT id FROM makler WHERE user_id=u_makler)
     OR EXISTS(SELECT 1 FROM makler_fall_consent mfc JOIN makler m ON m.id=mfc.makler_id
               WHERE m.user_id=u_makler AND mfc.widerrufen_am IS NULL AND (mfc.claim_id=c.id OR mfc.fall_id=c.id)) LIMIT 1;
  SELECT c.id INTO y_makler FROM claims c WHERE
     c.geschaedigter_user_id IS DISTINCT FROM u_makler
     AND NOT EXISTS (SELECT 1 FROM claim_parties p WHERE p.claim_id=c.id AND p.user_id=u_makler AND p.ist_aktiv)
     AND (c.makler_id IS NULL OR c.makler_id NOT IN (SELECT id FROM makler WHERE user_id=u_makler))
     AND NOT EXISTS(SELECT 1 FROM makler_fall_consent mfc JOIN makler m ON m.id=mfc.makler_id
                    WHERE m.user_id=u_makler AND mfc.widerrufen_am IS NULL AND (mfc.claim_id=c.id OR mfc.fall_id=c.id)) LIMIT 1;

  SELECT c.id INTO x_werkstatt FROM claims c WHERE c.werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id=u_werkstatt) LIMIT 1;
  SELECT c.id INTO y_werkstatt FROM claims c WHERE
     (c.werkstatt_id IS NULL OR c.werkstatt_id NOT IN (SELECT id FROM werkstaetten WHERE user_id=u_werkstatt))
     AND c.geschaedigter_user_id IS DISTINCT FROM u_werkstatt
     AND NOT EXISTS (SELECT 1 FROM claim_parties p WHERE p.claim_id=c.id AND p.user_id=u_werkstatt AND p.ist_aktiv) LIMIT 1;

  FOR r IN SELECT * FROM (VALUES
      ('kunde',     u_kunde,     x_kunde,     y_kunde),
      ('sv',        u_sv,        x_sv,        y_sv),
      ('kb',        u_kb,        x_kb,        y_kb),
      ('kanzlei',   u_kanzlei,   x_kanzlei,   y_kanzlei),
      ('makler',    u_makler,    x_makler,    y_makler),
      ('werkstatt', u_werkstatt, x_werkstatt, y_werkstatt),
      ('admin',     u_admin,     x_kunde,     NULL::uuid),
      ('dispatch',  u_dispatch,  x_kunde,     NULL::uuid)
    ) AS t(rl, uid, x, y)
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);

    IF r.x IS NOT NULL THEN
      FOR v IN SELECT * FROM (VALUES ('v_claim_full','id'),('v_claim_listing','claim_id'),('v_claim_phase','claim_id')) AS vv(vn, vc)
      LOOP
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I = $1)', v.vn, v.vc) INTO sieht USING r.x;
        IF NOT sieht THEN rolle:=r.rl; view_name:=v.vn; befund:='UNTER-Exposure: sieht eigenen Claim X nicht'; RETURN NEXT; END IF;
      END LOOP;
    END IF;

    IF r.y IS NOT NULL THEN
      FOR v IN SELECT * FROM (VALUES
          ('v_claim_full','id'),('v_faelle_mit_aktuellem_termin','id'),('v_claim_listing','claim_id'),
          ('v_claim_phase','claim_id'),('v_claim_parties_safe','claim_id'),('v_claim_sv','id'),
          ('v_claim_timeline','claim_id'),('v_gutachten_werte','claim_id')) AS vv(vn, vc)
      LOOP
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I = $1)', v.vn, v.vc) INTO sieht USING r.y;
        IF sieht THEN rolle:=r.rl; view_name:=v.vn; befund:='UEBER-Exposure: sieht fremden Claim Y'; RETURN NEXT; END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.audit_claim_view_identity() FROM public;
GRANT EXECUTE ON FUNCTION public.audit_claim_view_identity() TO service_role;
