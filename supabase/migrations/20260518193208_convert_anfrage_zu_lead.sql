-- 2026-05-18: Atomare Convert-Function Anfrage → Lead.
-- SECURITY DEFINER, FOR UPDATE-Lock gegen parallele Convert-Race,
-- Idempotenz, Exception-Handler persistiert konvertier_status='failed'
-- bevor er die Exception nach oben propagiert. Channel-spezifische
-- Side-Effects in IF-Blöcken.
--
-- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md §4

CREATE OR REPLACE FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anfrage   public.anfragen;
  v_lead_id   uuid;
  v_vorname   text;
  v_nachname  text;
  v_telefon   text;
BEGIN
  -- 1. Anfrage holen mit Row-Lock (verhindert parallele Convert-Race)
  SELECT * INTO v_anfrage
  FROM public.anfragen
  WHERE id = p_anfrage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  -- Idempotenz: bereits konvertierte Anfragen geben bestehende lead_id zurück
  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  -- 2. Name-Split "Max Mustermann" → vorname="Max", nachname="Mustermann"
  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(
                  substr(trim(coalesce(v_anfrage.kontakt_name, '')),
                         length(v_vorname) + 2),
                  ''
                );
  v_telefon := trim(coalesce(v_anfrage.kontakt_telefon, ''));

  -- 3. Lead anlegen
  INSERT INTO public.leads (vorname, nachname, telefon, email, kunde_plz)
  VALUES (
    NULLIF(v_vorname, ''),
    v_nachname,
    NULLIF(v_telefon, ''),
    v_anfrage.kontakt_email,
    v_anfrage.kontakt_plz_oder_stadt
  )
  RETURNING id INTO v_lead_id;

  -- 4. Channel-spezifische Side-Effects
  -- Gutachter-Termin-Form: reservierten Slot in admin_termine übernehmen
  IF v_anfrage.quelle = 'gutachter-finder-termin'
     AND v_anfrage.payload ? 'vorgesehener_gutachter_id'
     AND v_anfrage.payload ? 'termin_start' THEN
    INSERT INTO public.admin_termine (
      typ, titel, lead_id, sv_id, start_zeit, end_zeit, status, erstellt_von
    ) VALUES (
      'vor-ort-besichtigung',
      'Besichtigung (aus Anfrage)',
      v_lead_id,
      (v_anfrage.payload->>'vorgesehener_gutachter_id')::uuid,
      (v_anfrage.payload->>'termin_start')::timestamptz,
      (v_anfrage.payload->>'termin_start')::timestamptz + interval '1 hour',
      'offen',
      auth.uid()
    );
  END IF;

  -- Makler-Channel: aktuell DEAKTIVIERT, weil leads.vermittelnder_makler_id
  -- nicht existiert. Beim Anlegen der Spalte (separate Migration) den Block
  -- unten aktivieren. Bis dahin würde die Function bei
  -- quelle='makler-partner-form' mit ungültigem Spalten-Verweis crashen.
  --
  -- IF v_anfrage.quelle = 'makler-partner-form'
  --    AND v_anfrage.payload ? 'vermittelnder_makler_id' THEN
  --   UPDATE public.leads
  --      SET vermittelnder_makler_id = (v_anfrage.payload->>'vermittelnder_makler_id')::uuid
  --    WHERE id = v_lead_id;
  -- END IF;

  -- 5. Anfrage als konvertiert markieren
  UPDATE public.anfragen
     SET lead_id           = v_lead_id,
         konvertiert_am    = now(),
         konvertier_status = 'success'
   WHERE id = p_anfrage_id;

  RETURN v_lead_id;

EXCEPTION WHEN OTHERS THEN
  -- Convert-Failure: Anfrage bleibt persistent, Status auf 'failed'
  UPDATE public.anfragen
     SET konvertier_status = 'failed',
         konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.convert_anfrage_zu_lead(uuid) IS
  'Atomic Convert Anfrage → Lead. Idempotent (re-runs returnen lead_id). Bei Failure: anfragen.konvertier_status=failed + konvertier_fehler=SQLERRM persistiert, dann Exception re-raised.';

GRANT EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid)
  TO authenticated, service_role;
