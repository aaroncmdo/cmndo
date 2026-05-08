-- CMM-37: faelle in supabase_realtime aufnehmen.
--
-- FallRealtimeRefresh.tsx (AAR-864) abonniert bereits faelle UPDATE
-- (filter: id=eq.${fallId}) — die Subscription bekam aber bisher nie
-- Events, weil faelle nicht in der supabase_realtime-Publication war.
--
-- Folgewirkung: LexDrive-Webhook setzt vs_reaktion_typ / vs_reaktion_am /
-- vs_kuerzung_grund / vs_ablehnungsgrund / vs_quote_prozent auf faelle —
-- mit dieser Migration triggert das einen Realtime-Event, FallRealtime-
-- Refresh debounced + ruft router.refresh, die RegulierungCard rendert
-- mit dem neuen vsReaktion-Snapshot. Live-Banner ohne Page-Reload.
--
-- Auch andere faelle-Updates (Status-Wechsel via transitionFallStatus,
-- KB-Edits etc.) werden jetzt live — kein Refresh-Knopf mehr noetig.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'faelle'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.faelle';
  END IF;
END $$;

ALTER TABLE public.faelle REPLICA IDENTITY FULL;
