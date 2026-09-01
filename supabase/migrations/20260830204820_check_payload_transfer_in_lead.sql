-- Befund 1 aus docs/2026-08-30-auftrag-check-lead-datenverlust.md
-- convert_anfrage_zu_lead() las v_anfrage.payload nie (nur in auskommentierten
-- Bloecken) -> die drei Antworten der Anspruchspruefung (/check) gingen beim
-- Uebergang anfragen -> leads verloren. Belegt an anfragen 3612682f-1529-47a9-ad10-
-- afce92c92e98 / lead 5c39b0ac-914c-4662-9543-d7f524bdb581: payload trug
-- schuld=gegner, leads.schuldfrage war NULL.

-- 1) Zielspalten fuer die beiden Antworten ohne bestehendes Zuhause.
--    unfall_her ist ein ZEITRAUM, kein Datum -> gehoert NICHT nach unfalldatum
--    (das waere ein erfundenes Datum). gutachten hatte gar kein Feld.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS unfall_zeitfenster text,
  ADD COLUMN IF NOT EXISTS gutachten_status   text;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_unfall_zeitfenster_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_unfall_zeitfenster_check
  CHECK (unfall_zeitfenster IS NULL
         OR unfall_zeitfenster = ANY (ARRAY['unter_woche'::text,'bis_monat'::text,'ueber_monat'::text]));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_gutachten_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_gutachten_status_check
  CHECK (gutachten_status IS NULL
         OR gutachten_status = ANY (ARRAY['nein'::text,'versicherung'::text,'ja'::text]));

COMMENT ON COLUMN public.leads.unfall_zeitfenster IS
  'Selbstauskunft "wann ist der Unfall passiert" als Zeitraum (unter_woche|bis_monat|ueber_monat). Bewusst getrennt von unfalldatum: der Kunde nennt kein Datum, ein abgeleitetes waere erfunden. Frist-/Verjaehrungssignal fuer Dispatch.';
COMMENT ON COLUMN public.leads.gutachten_status IS
  'Selbstauskunft Gutachten-Stand (nein|versicherung|ja). "versicherung" = gegnerische VS will einen eigenen Gutachter schicken -> zeitkritisch, Kunde hat freie SV-Wahl.';

-- 2) Funktion: payload->check uebertragen.
CREATE OR REPLACE FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_anfrage      public.anfragen;
  v_lead_id      uuid;
  v_vorname      text;
  v_nachname     text;
  v_telefon      text;
  v_check        jsonb;
  v_schuld       text;
  v_zeitfenster  text;
  v_gutachten    text;
  v_notiz        text;
BEGIN
  -- 1. Anfrage holen mit Row-Lock (verhindert parallele Convert-Race)
  SELECT * INTO v_anfrage
  FROM public.anfragen
  WHERE id = p_anfrage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  -- Idempotenz: bereits konvertierte Anfragen geben bestehende lead_id zurueck
  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  -- 2. Name-Split "Max Mustermann" -> vorname="Max", nachname="Mustermann"
  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(
                  substr(trim(coalesce(v_anfrage.kontakt_name, '')),
                         length(v_vorname) + 2),
                  ''
                );
  v_telefon := trim(coalesce(v_anfrage.kontakt_telefon, ''));

  -- 2b. Anspruchspruefung (/check): payload->check in typisierte Spalten heben.
  --
  -- WHITELIST-Mapping, kein Durchreichen: leads_schuldfrage_check kennt nur
  -- gegner|unklar|eigenverantwortung. Ein unbekannter Wert wuerde den INSERT
  -- werfen -> EXCEPTION-Block -> RAISE -> es entstuende GAR KEIN Lead. Das waere
  -- schlimmer als der heutige Feldverlust. Alles Unbekannte faellt daher auf NULL.
  --
  -- 'teils' (Formular: "Teils ich, teils der Gegner") -> 'unklar':
  --   'gegner' waere falsch (winkt einen Quotenfall als sauberen Haftpflichtfall
  --   durch), 'eigenverantwortung' ebenfalls (quali-gate.ts wertet das als
  --   Abbruch/Disqualifikation). 'unklar' ist der Review-Bucket und verlangt in
  --   qualification-engine.ts Q1 zusaetzlich aufklaerung_teilschuld_bestaetigt --
  --   genau die Teilschuld-Aufklaerung, die dieser Fall braucht.
  v_check := COALESCE(v_anfrage.payload -> 'check', '{}'::jsonb);

  v_schuld := CASE v_check ->> 'schuld'
                WHEN 'gegner'            THEN 'gegner'
                WHEN 'unklar'            THEN 'unklar'
                WHEN 'teils'             THEN 'unklar'
                WHEN 'eigenverantwortung' THEN 'eigenverantwortung'
                ELSE NULL
              END;

  v_zeitfenster := CASE v_check ->> 'unfall_her'
                     WHEN 'unter_woche' THEN 'unter_woche'
                     WHEN 'bis_monat'   THEN 'bis_monat'
                     WHEN 'ueber_monat' THEN 'ueber_monat'
                     ELSE NULL
                   END;

  v_gutachten := CASE v_check ->> 'gutachten'
                   WHEN 'nein'         THEN 'nein'
                   WHEN 'versicherung' THEN 'versicherung'
                   WHEN 'ja'           THEN 'ja'
                   ELSE NULL
                 END;

  -- Die Abbildung teils -> unklar ist verlustbehaftet. Damit der Dispatcher die
  -- Original-Aussage sieht (und nicht "unklar" als Nichtwissen missversteht),
  -- wird sie in der Notiz festgehalten. Der Lead entsteht hier gerade erst,
  -- notiz ist also garantiert leer -- es wird nichts ueberschrieben.
  v_notiz := CASE WHEN v_check ->> 'schuld' = 'teils'
                  THEN 'Anspruchsprüfung: Kunde gab „Teils ich, teils der Gegner" an. Als „unklar" erfasst — Teilschuld-Aufklärung erforderlich.'
                  ELSE NULL END;

  -- 3. Lead anlegen
  -- AAR-1478: source_channel + status explizit. Vorher fehlten beide ->
  -- source_channel war NULL, status fiel auf DB-Default 'neu' zurueck.
  -- v_anfrage.quelle entspricht den source_channel-Werten der anderen
  -- Lead-Eintrittspunkte ('kfzgutachter-ads-lp', 'gutachter-finder-termin',
  -- 'makler-partner-form', etc. -- wie in den Side-Effect-Stubs unten gemappt).
  INSERT INTO public.leads (
    vorname, nachname, telefon, email, kunde_plz,
    source_channel, status,
    schuldfrage, unfall_zeitfenster, gutachten_status, notiz
  )
  VALUES (
    NULLIF(v_vorname, ''),
    v_nachname,
    NULLIF(v_telefon, ''),
    v_anfrage.kontakt_email,
    v_anfrage.kontakt_plz_oder_stadt,
    v_anfrage.quelle,
    'neu'::lead_status,
    v_schuld,
    v_zeitfenster,
    v_gutachten,
    v_notiz
  )
  RETURNING id INTO v_lead_id;

  -- 4. Channel-spezifische Side-Effects
  --
  -- Gutachter-Termin-Channel: aktuell DEAKTIVIERT, weil admin_termine.erstellt_von
  -- NOT NULL ist und auth.uid() bei service_role-Call NULL liefert -> garantierter
  -- Crash. Aktivierung erfordert entweder:
  --   a) Eine Migration die admin_termine.erstellt_von nullable macht
  --   b) Einen designierten System-User (uuid-Konstante) als COALESCE-Fallback
  --
  -- IF v_anfrage.quelle = 'gutachter-finder-termin'
  --    AND v_anfrage.payload ? 'vorgesehener_gutachter_id'
  --    AND v_anfrage.payload ? 'termin_start' THEN
  --   INSERT INTO public.admin_termine (
  --     typ, titel, lead_id, sv_id, start_zeit, end_zeit, status, erstellt_von
  --   ) VALUES (
  --     'vor-ort-besichtigung',
  --     'Besichtigung (aus Anfrage)',
  --     v_lead_id,
  --     (v_anfrage.payload->>'vorgesehener_gutachter_id')::uuid,
  --     (v_anfrage.payload->>'termin_start')::timestamptz,
  --     (v_anfrage.payload->>'termin_start')::timestamptz + interval '1 hour',
  --     'offen',
  --     auth.uid()
  --   );
  -- END IF;

  -- Makler-Channel: ebenfalls DEAKTIVIERT (leads.vermittelnder_makler_id existiert nicht).
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
  -- Best-effort Failure-Persistence: in plpgsql ist die EXCEPTION-Block-UPDATE
  -- Teil einer impliziten Subtransaction. Bei RAISE wird die outer-Transaction
  -- abgebrochen, wenn der Caller im autocommit-Modus laeuft (z.B. RPC-Call der
  -- Server-Action) -- dann persistiert dieses UPDATE NICHT. In transaktionalen
  -- Caller-Contexts (wo der Caller catched + committed) bleibt es bestehen.
  -- Caller-side-Logging (Server-Action console.error mit anfrage_id) ist die
  -- verlaessliche Failure-Trace.
  UPDATE public.anfragen
     SET konvertier_status = 'failed',
         konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$function$;

-- 3) Die beiden neuen Spalten im Dispatch sichtbar UND speicherbar machen.
--    Anzeige + Save-Allowlist sind beide config-getrieben (onboarding_felder,
--    ladeLeadErfassungLeadsFelder) -- ohne diese Zeilen waere die Spalte gefuellt,
--    aber fuer den Dispatcher unsichtbar, also so tot wie der payload heute.
--    audience='dispatcher': der Kunden-Flow bekommt KEINE neuen Fragen.
INSERT INTO public.onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target, audience, sektion)
VALUES
  ('6db3e915-e344-41b5-bb29-ca81172f96e3', 25, 'unfall_zeitfenster', 'segmented',
   'Unfall liegt zurück (Selbstauskunft)',
   'Aus der Anspruchsprüfung — Zeitraum, kein Datum.',
   false,
   '[{"label":"< 1 Woche","value":"unter_woche"},{"label":"1–4 Wochen","value":"bis_monat"},{"label":"> 1 Monat","value":"ueber_monat"}]'::jsonb,
   '{"tabelle":"leads","spalte":"unfall_zeitfenster"}'::jsonb,
   'dispatcher', 'unfall'),
  ('6db3e915-e344-41b5-bb29-ca81172f96e3', 26, 'gutachten_status', 'segmented',
   'Gutachten-Stand (Selbstauskunft)',
   'Aus der Anspruchsprüfung. „Gegner-VS schickt eigenen" ist zeitkritisch — der Kunde hat freie SV-Wahl.',
   false,
   '[{"label":"Noch keins","value":"nein"},{"label":"Gegner-VS schickt eigenen","value":"versicherung"},{"label":"Liegt vor","value":"ja"}]'::jsonb,
   '{"tabelle":"leads","spalte":"gutachten_status"}'::jsonb,
   'dispatcher', 'unfall');