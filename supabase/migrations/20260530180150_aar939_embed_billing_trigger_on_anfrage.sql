-- AAR-939 Stream 8b: Billing-Hook von gutachter_termine -> gutachter_finder_anfragen
-- umgehaengt. Grund: gfa.termin_id wird nirgends gesetzt (0 Live-Rows) -> der
-- Termin-Hook (Migration 20260530171504) feuerte ins Leere. Der reale Abschluss-
-- Marker fuer eine Monika-Embed-Anfrage ist gfa.status='abgeschlossen' (setzt
-- aktualisiereAnfrageStatus / Dispatch + SV-Inbox). Claim-/Termin-unabhaengig.
--
-- Alten Termin-Trigger + Funktion droppen (waren tot).
DROP TRIGGER IF EXISTS embed_termin_billing ON public.gutachter_termine;
DROP FUNCTION IF EXISTS public.tg_embed_termin_billing();

-- Neuer Hook direkt auf der Anfrage. BEFORE UPDATE: NEW direkt modifizieren,
-- kein zweiter Write, keine Selbst-Rekursion. WHEN-Clause guarded alles
-- (nur sv_embed/Variante B, nur beim Uebergang nach 'abgeschlossen', nur
-- einmal -> abrechnung_id IS NULL + abrechnungs_relevant IS NOT TRUE).
CREATE OR REPLACE FUNCTION public.tg_embed_anfrage_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.abrechnungs_relevant := true;
  NEW.abrechnungs_betrag_eur := COALESCE(
    (SELECT es.einzelpreis_eur FROM public.embed_sites es WHERE es.id = NEW.embed_site_id),
    70.00);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS embed_anfrage_billing ON public.gutachter_finder_anfragen;
CREATE TRIGGER embed_anfrage_billing
  BEFORE UPDATE OF status ON public.gutachter_finder_anfragen
  FOR EACH ROW
  WHEN (
    NEW.status = 'abgeschlossen'
    AND OLD.status IS DISTINCT FROM 'abgeschlossen'
    AND NEW.source = 'sv_embed'
    AND NEW.variante = 'B'
    AND NEW.abrechnungs_relevant IS NOT TRUE
    AND NEW.abrechnung_id IS NULL
  )
  EXECUTE FUNCTION public.tg_embed_anfrage_billing();
