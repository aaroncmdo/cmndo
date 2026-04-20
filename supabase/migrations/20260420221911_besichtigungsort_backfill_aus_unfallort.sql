-- 1. Trigger-Fix: trigger_kanzlei_provision referenziert vollmacht_unterschrieben
--    das durch AAR-583 auf vollmacht_signiert_am umgestellt wurde.
--    Ohne diesen Fix schlaegt jeder UPDATE auf leads fehl der die Conditions
--    triggert — auch das Backfill unten.
CREATE OR REPLACE FUNCTION public.trigger_kanzlei_provision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Nur ausloesen wenn: vollmacht neu signiert UND mandatstyp = kanzlei-claimondo
  IF NEW.vollmacht_signiert_am IS NOT NULL
     AND OLD.vollmacht_signiert_am IS NULL
     AND NEW.mandatstyp = 'kanzlei-claimondo'
  THEN
    INSERT INTO finance_eintraege (typ, betrag, status, beschreibung, referenz_id, referenz_typ)
    VALUES (
      'kanzlei-provision',
      150,
      'offen',
      'Kanzlei-Provision 150 EUR netto - Vollmacht signiert: ' || COALESCE(NEW.vorname, '') || ' ' || COALESCE(NEW.nachname, ''),
      NEW.id,
      'leads'
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Backfill: Besichtigungsort aus Unfallort fuer Legacy-Leads.
--    Befund Audit 2026-04-21: 22 Leads haben unfallort_lat gesetzt, 0 haben
--    besichtigungsort_lat. Dispatcher nutzen faktisch nur den Unfallort-Picker.
--    Default-Annahme: Auto steht am Unfallort. Dispatcher kann ueber den
--    Phase-2-Besichtigungsort-Picker ueberschreiben wenn Fahrzeug in Werkstatt.
UPDATE public.leads
SET
  besichtigungsort_adresse = unfallort,
  besichtigungsort_lat = unfallort_lat,
  besichtigungsort_lng = unfallort_lng,
  updated_at = now()
WHERE besichtigungsort_lat IS NULL
  AND unfallort_lat IS NOT NULL;

-- 3. Faelle-Backfill: Besichtigungsort aus schadens_adresse/plz/ort wo leer.
UPDATE public.faelle
SET
  besichtigungsort_adresse = NULLIF(
    TRIM(CONCAT_WS(', ',
      NULLIF(schadens_adresse, ''),
      NULLIF(CONCAT_WS(' ', NULLIF(schadens_plz, ''), NULLIF(schadens_ort, '')), '')
    )),
    ''
  ),
  updated_at = now()
WHERE besichtigungsort_adresse IS NULL
  AND (schadens_adresse IS NOT NULL OR schadens_ort IS NOT NULL);
