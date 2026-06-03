-- Erweiterung zu 20260530195530: Der embed-B-Lead wird als nur_gutachter-Vorgang
-- markiert (service_typ). Aaron 30.05.: embed-B ist ein nur-Gutachten-Fall (kein
-- Kanzlei-/Regulierungs-Service). convert-lead-to-claim liest lead.service_typ ->
-- der spaeter erzeugte Claim wird nur_gutachter (keine Kanzlei, kein LexDrive,
-- Termin verbindlich schon bei SA). leads.service_typ-CHECK erlaubt 'nur_gutachter'.
CREATE OR REPLACE FUNCTION public.convert_embed_anfrage_zu_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_lead_id uuid;
  v_sv_profile uuid;
BEGIN
  IF NEW.source = 'sv_embed' AND NEW.variante = 'B' AND NEW.konvertiert_zu_lead_id IS NULL THEN
    SELECT s.profile_id INTO v_sv_profile
    FROM public.embed_sites e
    JOIN public.sachverstaendige s ON s.id = e.sv_id
    WHERE e.id = NEW.embed_site_id;

    INSERT INTO public.leads (
      vorname, nachname, email, telefon,
      schadentyp, kennzeichen, wunschtermin,
      besichtigungsort_adresse, ga_client_id,
      source_channel, status, zugewiesen_an, service_typ
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
      'neu'::lead_status,
      v_sv_profile,
      'nur_gutachter'
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
