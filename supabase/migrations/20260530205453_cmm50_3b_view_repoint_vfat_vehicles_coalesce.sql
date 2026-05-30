-- CMM-50.3b: vehicles-Repoint von v_faelle_mit_aktuellem_termin (15 Fahrzeug-Spalten ->
-- vehicles SSoT via LEFT JOIN + COALESCE-Fallback auf faelle.fahrzeug_*). vehicles leer ->
-- COALESCE faellt auf faelle zurueck -> funktional No-Op (Pre-Cutover, CMM-49).
-- Server-seitiger replace()-Transform der Live-Viewdef (kein 17k-Hand-Transkript): nur die
-- 15 Fahrzeug-Spalten + 1 Join aendern sich; ~185 uebrige Spalten unberuehrt (kein Match).
-- Selbst-Assert: alle alten Pattern weg + exakt 16 veh.-Refs + genau 1 vehicles-Join,
-- sonst RAISE -> atomarer Rollback. CREATE OR REPLACE erzwingt Spalten-Name/-Typ/-Reihenfolge.
-- Precision-Casts Pflicht (CMM-44 SP-G): ...::text / EXTRACT(YEAR ...)::integer. Vorlage: 20260530194624 (50.3a).
DO $cmm50_3b$
DECLARE
  _new  text;
  _veh  int;
  _join int;
BEGIN
  _new := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);

  _new := replace(_new, '     LEFT JOIN claims c ON c.id = f.claim_id',
                        '     LEFT JOIN claims c ON c.id = f.claim_id' || chr(10) ||
                        '     LEFT JOIN vehicles veh ON veh.id = c.vehicle_id');

  _new := replace(_new, '    f.kennzeichen,',          '    COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen,');
  _new := replace(_new, '    f.fahrzeug_typ,',         '    COALESCE(veh.bauart, f.fahrzeug_typ) AS fahrzeug_typ,');
  _new := replace(_new, '    f.fahrzeug_hersteller,',  '    COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller,');
  _new := replace(_new, '    f.fahrzeug_modell,',      '    COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell,');
  _new := replace(_new, '    f.fahrzeug_baujahr,',     '    COALESCE((EXTRACT(year FROM veh.baujahr_monat))::integer, f.fahrzeug_baujahr) AS fahrzeug_baujahr,');
  _new := replace(_new, '    f.fin_quelle,',           '    COALESCE(veh.fin_quelle, f.fin_quelle) AS fin_quelle,');
  _new := replace(_new, '    f.fin_extrahiert_am,',    '    COALESCE(veh.fin_extrahiert_am, f.fin_extrahiert_am) AS fin_extrahiert_am,');
  _new := replace(_new, '    f.fahrzeug_farbe,',       '    COALESCE(veh.farbe_klartext, f.fahrzeug_farbe) AS fahrzeug_farbe,');
  _new := replace(_new, '    f.erstzulassung,',        '    COALESCE(veh.erstzulassung::text, f.erstzulassung) AS erstzulassung,');
  _new := replace(_new, '    f.kilometerstand,',       '    COALESCE(veh.aktueller_kilometerstand, f.kilometerstand) AS kilometerstand,');
  _new := replace(_new, '    f.fin_vin,',              '    COALESCE(veh.fin::text, f.fin_vin) AS fin_vin,');
  _new := replace(_new, '    f.fahrzeug_ausstattung,', '    COALESCE(veh.fahrzeug_ausstattung, f.fahrzeug_ausstattung) AS fahrzeug_ausstattung,');
  _new := replace(_new, '    f.hsn,',                  '    COALESCE(veh.hsn::text, f.hsn) AS hsn,');
  _new := replace(_new, '    f.tsn,',                  '    COALESCE(veh.tsn::text, f.tsn) AS tsn,');
  _new := replace(_new, '    f.lackfarbe_code,',       '    COALESCE(veh.farbcode, f.lackfarbe_code) AS lackfarbe_code,');

  IF position('    f.kennzeichen,'          in _new) > 0
   OR position('    f.fahrzeug_typ,'         in _new) > 0
   OR position('    f.fahrzeug_hersteller,'  in _new) > 0
   OR position('    f.fahrzeug_modell,'      in _new) > 0
   OR position('    f.fahrzeug_baujahr,'     in _new) > 0
   OR position('    f.fin_quelle,'           in _new) > 0
   OR position('    f.fin_extrahiert_am,'    in _new) > 0
   OR position('    f.fahrzeug_farbe,'       in _new) > 0
   OR position('    f.erstzulassung,'        in _new) > 0
   OR position('    f.kilometerstand,'       in _new) > 0
   OR position('    f.fin_vin,'              in _new) > 0
   OR position('    f.fahrzeug_ausstattung,' in _new) > 0
   OR position('    f.hsn,'                  in _new) > 0
   OR position('    f.tsn,'                  in _new) > 0
   OR position('    f.lackfarbe_code,'       in _new) > 0 THEN
    RAISE EXCEPTION 'CMM-50.3b: altes f.fahrzeug_*-Pattern nach Transform noch vorhanden — Live-Viewdef-Format weicht ab, Abbruch.';
  END IF;

  _veh  := (length(_new) - length(replace(_new, 'veh.', ''))) / length('veh.');
  _join := (length(_new) - length(replace(_new, 'LEFT JOIN vehicles veh', ''))) / length('LEFT JOIN vehicles veh');
  IF _veh <> 16 THEN
    RAISE EXCEPTION 'CMM-50.3b: erwartete 16 veh.-Refs, fand % — Abbruch.', _veh;
  END IF;
  IF _join <> 1 THEN
    RAISE EXCEPTION 'CMM-50.3b: erwartete genau 1 vehicles-Join, fand % — Abbruch.', _join;
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || _new;
END
$cmm50_3b$;
