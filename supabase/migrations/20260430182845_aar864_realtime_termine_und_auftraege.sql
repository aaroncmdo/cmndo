-- AAR-864: Realtime-Publication für gutachter_termine + auftraege.
--
-- Aaron-Wunsch: Kunde- und SV-Portal sollen Termin-/Verlegungs-Änderungen
-- live sehen, ohne dass der User refreshen muss. Dazu braucht es:
--   1. Tabelle in supabase_realtime-Publication
--   2. REPLICA IDENTITY FULL (sonst liefern UPDATE/DELETE-Events nur die
--      Primary-Key-Spalten — wir wollen den vollen Vorher-Snapshot)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gutachter_termine'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.gutachter_termine';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'auftraege'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.auftraege';
  END IF;
END $$;

ALTER TABLE public.gutachter_termine REPLICA IDENTITY FULL;
ALTER TABLE public.auftraege         REPLICA IDENTITY FULL;
