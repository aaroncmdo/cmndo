-- CMM-33: fall_dokumente in supabase_realtime aufnehmen.
--
-- Begruendung: KB-Hub zeigt eine rote Badge wenn der Kunde Dokumente
-- hochgeladen hat (uploaded_by_kunde=true, kb_gesehen_am IS NULL —
-- siehe Migration 20260505151819 / PR #500). Bisher updated die Badge
-- erst beim naechsten Hub-Reload. Mit der Realtime-Subscription auf
-- fall_dokumente in KanbanUploadsRealtime.tsx triggert ein Upload des
-- Kunden direkt einen router.refresh(), die Badge erscheint live.
--
-- REPLICA IDENTITY FULL liefert auch beim UPDATE-Event die alten Werte
-- mit, was wir fuer die kb_gesehen_am-Transition brauchen.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'fall_dokumente'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.fall_dokumente';
  END IF;
END $$;

ALTER TABLE public.fall_dokumente REPLICA IDENTITY FULL;
