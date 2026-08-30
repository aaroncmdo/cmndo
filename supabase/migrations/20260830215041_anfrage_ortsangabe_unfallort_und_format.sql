-- Befund 2 aus docs/2026-08-30-auftrag-check-lead-datenverlust.md
--
-- kontakt_plz_oder_stadt ging bisher ungeprueft nach leads.kunde_plz. Zwei Fehler:
--
-- 1) SEMANTIK: Das Formularlabel lautet "Stadt / PLZ des Unfalls"
--    (home.lead_form.field_city_label, genutzt von /check UND der Startseite) — es
--    ist der UNFALLORT, nicht die Kundenadresse. unfallort/unfallort_ort/unfallort_plz
--    blieben leer, damit greift die SV-Umkreissuche nicht.
--
-- 2) FORMAT: Der Placeholder erlaubt ausdruecklich beides ("z. B. Koeln oder 50670").
--    Ein Stadtname in kunde_plz ist kein Schoenheitsfehler — die Spalte wird als PLZ
--    GELESEN: sv-termin.ts:350 schickt "PLZ: <wert>" an den Sachverstaendigen,
--    vermittlung-server.ts:65 nutzt sie als PLZ fuer die Werkstatt-Umkreissuche,
--    dispatch/isochrone fuer Karten-Radien. "Osnabrueck" als PLZ verfaelscht das.
--    Ein Feldname ist kein Formatvertrag -> hier wird er einer.
--
-- Die Unfallort-Zuordnung gilt bewusst NUR fuer die zwei Quellen, deren Label
-- nachweislich den Unfall meint. kfzgutachter-ads-lp / autounfall-io haben eigene
-- Labels, die nicht geprueft sind — dort waere es geraten. Die Format-Trennung
-- (PLZ vs. Ort) gilt fuer alle: ein Stadtname gehoert nie in eine PLZ-Spalte.
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
  v_ort          text;
  v_ist_plz      boolean;
  v_ist_unfallort boolean;
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

  -- 2c. Ortsangabe (Befund 2): Format erkennen und richtig einsortieren.
  -- Deutsche PLZ = genau 5 Ziffern. Alles andere ist ein Ortsname.
  v_ort := NULLIF(trim(coalesce(v_anfrage.kontakt_plz_oder_stadt, '')), '');
  v_ist_plz := v_ort IS NOT NULL AND v_ort ~ '^[0-9]{5}$';
  v_ist_unfallort := v_anfrage.quelle IN ('claimondo-check', 'claimondo-home-hero');

  -- 3. Lead anlegen
  -- AAR-1478: source_channel + status explizit. Vorher fehlten beide ->
  -- source_channel war NULL, status fiel auf DB-Default 'neu' zurueck.
  INSERT INTO public.leads (
    vorname, nachname, telefon, email,
    kunde_plz, kunde_stadt,
    unfallort, unfallort_plz, unfallort_ort,
    source_channel, status,
    schuldfrage, unfall_zeitfenster, gutachten_status, notiz
  )
  VALUES (
    NULLIF(v_vorname, ''),
    v_nachname,
    NULLIF(v_telefon, ''),
    v_anfrage.kontakt_email,
    CASE WHEN v_ist_plz THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_plz THEN NULL  ELSE v_ort END,
    CASE WHEN v_ist_unfallort THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_unfallort AND v_ist_plz THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_unfallort AND NOT v_ist_plz THEN v_ort ELSE NULL END,
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
  -- Makler-Channel: ebenfalls DEAKTIVIERT (leads.vermittelnder_makler_id existiert nicht).

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
  -- Server-Action) -- dann persistiert dieses UPDATE NICHT.
  UPDATE public.anfragen
     SET konvertier_status = 'failed',
         konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$function$;
