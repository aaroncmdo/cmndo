-- AAR-939 Monika-Embed: Variante-B-Embed-Anfragen werden zu Leads.
-- Modell (Aaron 30.05.): Alles was von aussen ueber das Widget kommt wird ZUERST
-- eine Anfrage (gutachter_finder_anfragen) — die bleibt als Eintrags-/Audit-Record
-- bestehen. NUR bezahlte Anfragen (Variante B, source='sv_embed') spawnen
-- ZUSAETZLICH einen verlinkten Lead, der in die Dispatch-Pipeline laeuft.
-- Variante A (free) + nativer Funnel (source IS NULL) bleiben reine Anfragen.
--
-- BEFORE INSERT, damit die Anfrage IMMER persistiert (auch wenn der Lead-Spawn
-- scheitert -> Fehler wird in konvertierung_fehler vermerkt, Anfrage bleibt).
-- Der Status der Anfrage wird NICHT angefasst: ihr eigener Lebenszyklus
-- (neu -> ... -> abgeschlossen) bleibt fuer das 70-EUR-Billing (Stream 8) intakt.
-- Der Lead ist eine separate Entitaet, verlinkt via konvertiert_zu_lead_id.
-- Lead wird UNASSIGNED erzeugt (Dispatch-Pool, Aaron-Entscheidung) +
-- source_channel='monika_embed'.
--
-- HINWEIS: Die schadentyp-Behandlung in diesem File ist unvollstaendig und wird
-- direkt vom Folge-Migration 20260530194605 korrigiert (leads.schadentyp-CHECK).

CREATE OR REPLACE FUNCTION public.convert_embed_anfrage_zu_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  -- Nur bezahlte Embed-Anfragen (Variante B) werden zu Leads.
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
      NEW.schadentyp,
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
  -- Ein Lead-Spawn-Fehler wird nur vermerkt, bricht den Anfrage-Insert NICHT.
  NEW.konvertiert_zu_lead_id := NULL;
  NEW.konvertiert_am := NULL;
  NEW.konvertierung_fehler := SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convert_embed_anfrage_zu_lead ON public.gutachter_finder_anfragen;
CREATE TRIGGER trg_convert_embed_anfrage_zu_lead
  BEFORE INSERT ON public.gutachter_finder_anfragen
  FOR EACH ROW
  EXECUTE FUNCTION public.convert_embed_anfrage_zu_lead();
