-- AAR-939 Stream 8: Billing-Trigger fuer Monika-Embed Variante-B Termine.
-- Wenn ein Termin durchgefuehrt wird (durchgefuehrt_am NULL->NOT NULL), wird die
-- zugehoerige Embed-Anfrage (source='sv_embed', variante='B') als abrechnungs-
-- relevant markiert und mit dem Einzelpreis der Embed-Site (default 70 EUR) belegt.
-- Claim-unabhaengig: feuert egal wer durchgefuehrt_am setzt (markTerminDurchgefuehrt etc.).
--
-- Hook = durchgefuehrt_am (NICHT status): der gutachter_termine.status-CHECK kennt
-- KEIN 'durchgefuehrt'; der Abschluss-Marker in der Praxis ist durchgefuehrt_am.
CREATE OR REPLACE FUNCTION public.tg_embed_termin_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.durchgefuehrt_am IS NOT NULL AND OLD.durchgefuehrt_am IS NULL THEN
    UPDATE public.gutachter_finder_anfragen gfa
       SET abrechnungs_relevant   = true,
           abrechnungs_betrag_eur = COALESCE(
             (SELECT es.einzelpreis_eur FROM public.embed_sites es WHERE es.id = gfa.embed_site_id),
             70.00)
     WHERE gfa.termin_id = NEW.id
       AND gfa.source    = 'sv_embed'
       AND gfa.variante  = 'B'
       AND gfa.abrechnungs_relevant IS NOT TRUE
       AND gfa.abrechnung_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS embed_termin_billing ON public.gutachter_termine;
CREATE TRIGGER embed_termin_billing
  AFTER UPDATE OF durchgefuehrt_am ON public.gutachter_termine
  FOR EACH ROW
  WHEN (NEW.durchgefuehrt_am IS NOT NULL AND OLD.durchgefuehrt_am IS NULL)
  EXECUTE FUNCTION public.tg_embed_termin_billing();
