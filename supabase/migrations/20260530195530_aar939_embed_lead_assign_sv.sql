-- Erweiterung zu 20260530194129/194605: Der gespawnte Lead wird dem DEDIZIERTEN
-- SV der Embed-Site direkt zugewiesen (Aaron 30.05.: Monika kennt seinen SV;
-- kein anonymer Dispatch-Pool). Kette: embed_site -> embed_sites.sv_id ->
-- sachverstaendige.profile_id -> leads.zugewiesen_an (FK profiles).
-- Fallback NULL (Pool) wenn die Site keinen SV/Profile hat.
-- HINWEIS (RLS): SV sieht Leads aktuell nur ueber faelle.sv_id, NICHT ueber
-- zugewiesen_an. Diese Zuweisung ist Attribution + Dispatch-Routing; eine
-- SV-Portal-Sicht auf rohe Embed-Leads waere ein separater RLS-/View-Schritt.
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
      source_channel, status, zugewiesen_an
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
      v_sv_profile
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
