-- RLS-Haertung Schritt 2b: Identity-CROSS-COMPARE auf der View-Schicht. Geht via JWT-Sim in einer
-- Definer-Fn (View-Gate = WHERE-Klausel, kein SET ROLE noetig -> anders als Tabellen-RLS). Pro Rolle
-- mit bekanntem eigenem Claim X (roh-verlinkt) + fremdem Claim Y (genuin verboten lt. Gate-Spec):
--   POSITIV (Unter-Exposure/Geist-Klasse): X MUSS in den 3 kanonischen 1-Zeile-pro-Claim-Views sein.
--   NEGATIV (Ueber-Exposure/Leak):         Y darf in KEINER gegateten View sein.
-- Faengt damit GENAU die Klassen, die das Nobody-Netz NICHT faengt (Geist) bzw. nur grob (gezielter
-- Cross-Rollen-Leak). X/Y werden roh aus der Linkage abgeleitet (unabh. vom Gate -> nicht zirkulaer).
-- kb-Nuance: Gate zeigt kb auch kundenbetreuer_id IS NULL -> Y muss NOT NULL UND <> kb sein.
-- CI (scripts/check-claim-view-rls.mjs) asserted: Ergebnis LEER.
CREATE OR REPLACE FUNCTION public.audit_claim_view_identity()
 RETURNS TABLE(rolle text, view_name text, befund text)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  u_kunde uuid := '113aebe5-0630-4753-809a-6756df5ba432';
  u_sv    uuid := '25a8c28e-b85a-4769-94d4-920e47f64079';
  u_kb    uuid := '59bdb155-e283-4fd1-a4ca-222f924a0efa';
  sv_sach uuid;
  x_kunde uuid; y_kunde uuid;
  x_sv uuid;    y_sv uuid;
  x_kb uuid;    y_kb uuid;
  r record; v record;
  sieht boolean;
BEGIN
  SELECT id INTO sv_sach FROM sachverstaendige WHERE profile_id = u_sv;
  -- X = eigener Claim (roh), Y = fremder Claim (lt. Gate-Spec verboten) — alles als postgres/BYPASSRLS
  SELECT id INTO x_kunde FROM claims WHERE geschaedigter_user_id = u_kunde LIMIT 1;
  SELECT c.id INTO y_kunde FROM claims c WHERE c.geschaedigter_user_id IS DISTINCT FROM u_kunde
    AND NOT EXISTS (SELECT 1 FROM claim_parties p WHERE p.claim_id=c.id AND p.user_id=u_kunde AND p.ist_aktiv) LIMIT 1;
  SELECT c.id INTO x_sv FROM claims c WHERE c.sv_id = sv_sach LIMIT 1;
  SELECT c.id INTO y_sv FROM claims c WHERE c.sv_id IS DISTINCT FROM sv_sach
    AND NOT EXISTS (SELECT 1 FROM claim_parties p WHERE p.claim_id=c.id AND p.user_id=u_sv AND p.ist_aktiv) LIMIT 1;
  SELECT c.id INTO x_kb FROM claims c WHERE c.kundenbetreuer_id = u_kb LIMIT 1;
  SELECT c.id INTO y_kb FROM claims c WHERE c.kundenbetreuer_id IS NOT NULL AND c.kundenbetreuer_id <> u_kb LIMIT 1;

  FOR r IN SELECT * FROM (VALUES
      ('kunde', u_kunde, x_kunde, y_kunde),
      ('sv',    u_sv,    x_sv,    y_sv),
      ('kb',    u_kb,    x_kb,    y_kb)
    ) AS t(rl, uid, x, y)
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);

    -- POSITIV: X muss in den 3 kanonischen 1-Zeile-pro-Claim-Views sein (Unter-Exposure faengt Geist)
    IF r.x IS NOT NULL THEN
      FOR v IN SELECT * FROM (VALUES ('v_claim_full','id'),('v_claim_listing','claim_id'),('v_claim_phase','claim_id')) AS vv(vn, vc)
      LOOP
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I = $1)', v.vn, v.vc) INTO sieht USING r.x;
        IF NOT sieht THEN rolle:=r.rl; view_name:=v.vn; befund:='UNTER-Exposure: sieht eigenen Claim X nicht'; RETURN NEXT; END IF;
      END LOOP;
    END IF;

    -- NEGATIV: Y darf in KEINER gegateten View sein (Ueber-Exposure/Leak)
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
