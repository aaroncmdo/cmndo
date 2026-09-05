-- Quelle B aus docs/2026-08-30-auftrag-unverbindliche-auswertung-durchreichen.md
--
-- buildCheckResult() erzeugt aus den drei Antworten ein Ergebnis, das der Kunde SIEHT
-- und das danach verfaellt — gespeichert wurde nur der tier als Analytics-Event.
--
-- WAS BEWUSST NICHT GESPEICHERT WIRD: die EUR-Spannen. Sie sind statisch (fuer jeden
-- mit schuld=gegner identisch, RANGE_KEYS + i18n) und werden NICHT gerechnet. In ein
-- Feld geschrieben saehen sie aus wie eine Bezifferung und waeren keine. Gespeichert
-- wird der tier + Zeitpunkt + Quelle + die Rohantworten; daraus laesst sich der Rest
-- jederzeit herleiten, und es bleibt ehrlich.
--
-- WARUM DIE ROHANTWORTEN MIT MUESSEN: tier ist zwar eine Funktion von schuld
-- (resolveTier), aber NICHT mehr von leads.schuldfrage — dort wird 'teils' auf
-- 'unklar' abgebildet (CHECK-Constraint, siehe 20260830204820). 'teils'->quote und
-- 'unklar'->pruefen waeren sonst ununterscheidbar.
--
-- Feldname bewusst 'auswertung_unverbindlich', nicht 'anspruchshoehe': was hier steht,
-- ist eine Einschaetzung aus drei Klicks, kein Gutachten und keine Zusage.
ALTER TABLE public.leads  ADD COLUMN IF NOT EXISTS auswertung_unverbindlich jsonb;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS auswertung_unverbindlich jsonb;

COMMENT ON COLUMN public.leads.auswertung_unverbindlich IS
  'Unverbindliche Selbst-Auswertung (Anspruchspruefung/Foto-Check). Shape: {quelle, tier, erstellt_am, antworten}. KEIN Betrag — die im Frontend gezeigten Spannen sind statisch und werden bewusst nicht persistiert. Jede Ansicht muss den unverbindlichen Charakter kenntlich machen.';
COMMENT ON COLUMN public.claims.auswertung_unverbindlich IS
  'Siehe leads.auswertung_unverbindlich. Wird bei der Lead->Claim-Konversion durchgereicht.';

-- Funktion: Auswertung beim Convert mitschreiben.
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
  v_tier         text;
  v_auswertung   jsonb;
BEGIN
  SELECT * INTO v_anfrage FROM public.anfragen WHERE id = p_anfrage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(substr(trim(coalesce(v_anfrage.kontakt_name, '')), length(v_vorname) + 2), '');
  v_telefon  := trim(coalesce(v_anfrage.kontakt_telefon, ''));

  -- WHITELIST-Mapping (siehe 20260830204820): ein unbekannter Wert wuerde den INSERT
  -- werfen -> EXCEPTION -> RAISE -> gar kein Lead. Unbekanntes faellt auf NULL.
  v_check := COALESCE(v_anfrage.payload -> 'check', '{}'::jsonb);

  v_schuld := CASE v_check ->> 'schuld'
                WHEN 'gegner' THEN 'gegner'
                WHEN 'unklar' THEN 'unklar'
                WHEN 'teils'  THEN 'unklar'
                WHEN 'eigenverantwortung' THEN 'eigenverantwortung'
                ELSE NULL END;

  v_zeitfenster := CASE v_check ->> 'unfall_her'
                     WHEN 'unter_woche' THEN 'unter_woche'
                     WHEN 'bis_monat'   THEN 'bis_monat'
                     WHEN 'ueber_monat' THEN 'ueber_monat'
                     ELSE NULL END;

  v_gutachten := CASE v_check ->> 'gutachten'
                   WHEN 'nein'         THEN 'nein'
                   WHEN 'versicherung' THEN 'versicherung'
                   WHEN 'ja'           THEN 'ja'
                   ELSE NULL END;

  v_notiz := CASE WHEN v_check ->> 'schuld' = 'teils'
                  THEN 'Anspruchsprüfung: Kunde gab „Teils ich, teils der Gegner" an. Als „unklar" erfasst — Teilschuld-Aufklärung erforderlich.'
                  ELSE NULL END;

  -- Quelle B: tier spiegelt resolveTier() aus lib/check/result-model.ts.
  -- Aus der ROHANTWORT abgeleitet, nicht aus v_schuld -- sonst waere 'teils' (quote)
  -- nicht mehr von 'unklar' (pruefen) unterscheidbar.
  v_tier := CASE v_check ->> 'schuld'
              WHEN 'gegner' THEN 'voll'
              WHEN 'teils'  THEN 'quote'
              WHEN 'selbst' THEN 'kasko'
              WHEN 'eigenverantwortung' THEN 'kasko'
              WHEN 'unklar' THEN 'pruefen'
              ELSE NULL END;

  v_auswertung := CASE WHEN v_tier IS NULL THEN NULL ELSE jsonb_build_object(
    'quelle',      'anspruchspruefung',
    'tier',        v_tier,
    'erstellt_am', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'antworten',   v_check
  ) END;

  -- Ortsangabe (Befund 2): Format erkennen und richtig einsortieren.
  v_ort := NULLIF(trim(coalesce(v_anfrage.kontakt_plz_oder_stadt, '')), '');
  v_ist_plz := v_ort IS NOT NULL AND v_ort ~ '^[0-9]{5}$';
  v_ist_unfallort := v_anfrage.quelle IN ('claimondo-check', 'claimondo-home-hero');

  INSERT INTO public.leads (
    vorname, nachname, telefon, email,
    kunde_plz, kunde_stadt,
    unfallort, unfallort_plz, unfallort_ort,
    source_channel, status,
    schuldfrage, unfall_zeitfenster, gutachten_status, notiz,
    auswertung_unverbindlich
  )
  VALUES (
    NULLIF(v_vorname, ''), v_nachname, NULLIF(v_telefon, ''), v_anfrage.kontakt_email,
    CASE WHEN v_ist_plz THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_plz THEN NULL  ELSE v_ort END,
    CASE WHEN v_ist_unfallort THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_unfallort AND v_ist_plz THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_unfallort AND NOT v_ist_plz THEN v_ort ELSE NULL END,
    v_anfrage.quelle, 'neu'::lead_status,
    v_schuld, v_zeitfenster, v_gutachten, v_notiz,
    v_auswertung
  )
  RETURNING id INTO v_lead_id;

  UPDATE public.anfragen
     SET lead_id = v_lead_id, konvertiert_am = now(), konvertier_status = 'success'
   WHERE id = p_anfrage_id;

  RETURN v_lead_id;

EXCEPTION WHEN OTHERS THEN
  UPDATE public.anfragen
     SET konvertier_status = 'failed', konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$function$;