-- Fix zu 20260530194129: leads.schadentyp ist per CHECK auf 5 Werte beschraenkt
-- (spurwechsel/auffahrunfall/vorfahrtsverletzung/parkplatz/sonstiges), gfa.schadentyp
-- ist Freitext (Widget schickt teils 'unbekannt'). Ungemappte Werte liessen den
-- Lead-Insert scheitern (Exception-geschluckt -> konvertierung_fehler, kein Lead).
-- Mapping: bekannte Werte durchreichen, alles andere -> 'sonstiges'.
CREATE OR REPLACE FUNCTION public.convert_embed_anfrage_zu_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  IF NEW.source = 'sv_embed' AND NEW.variante = 'B' AND NEW.konvertiert_zu_lead_id IS NULL THEN
    INSERT INTO public.leads (
      vorname, nachname, email, telefon,
      schadentyp, kennzeichen, wunschtermin,
      besichtigungsort_adresse, ga_client_id,
      source_channel, status
    )
    VALUES (
      NULLIF(btrim(coalesce(NEW.vorname, '')), ''),
      NULLIF(btrim(coalesce(NEW.nachname, '')), ''),
      NEW.email,
      NULLIF(btrim(coalesce(NEW.telefon, '')), ''),
      CASE WHEN NEW.schadentyp = ANY (ARRAY['spurwechsel','auffahrunfall','vorfahrtsverletzung','parkplatz','sonstiges'])
           THEN NEW.schadentyp ELSE 'sonstiges' END,
      NEW.kennzeichen,
      NEW.wunschtermin,
      NEW.schadenort,
      NEW.ga_client_id,
      'monika_embed',
      'neu'::lead_status
    )
    RETURNING id INTO v_lead_id;

    NEW.konvertiert_zu_lead_id := v_lead_id;
    NEW.konvertiert_am := now();
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Die Anfrage MUSS persistieren (Aaron: alles von aussen = erst Anfrage).
  NEW.konvertiert_zu_lead_id := NULL;
  NEW.konvertiert_am := NULL;
  NEW.konvertierung_fehler := SQLERRM;
  RETURN NEW;
END;
$$;
