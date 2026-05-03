-- CMM-37: kanzlei_faelle in supabase_realtime aufnehmen.
--
-- Begruendung: nach Phase 1-3 ist der Kanzleifall am Claim verankert.
-- VS-Kontakt + Auszahlung sind State-Transitions die SV/Admin/KB live
-- sehen muessen, sonst zeigt die Regulierungs-Card stale-Werte bis zum
-- naechsten Reload.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kanzlei_faelle'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.kanzlei_faelle';
  END IF;
END $$;

ALTER TABLE public.kanzlei_faelle REPLICA IDENTITY FULL;
