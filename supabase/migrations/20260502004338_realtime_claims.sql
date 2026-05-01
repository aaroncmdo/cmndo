-- claims in die supabase_realtime-Publication aufnehmen.
--
-- Begruendung: OCR-Pipeline schreibt Reparaturkosten/Minderwert/etc. nach
-- QC-Freigabe in claims. Kunde/SV/Admin sollen die abgeleiteten Werte
-- (Anspruch VS, Gutachten-Auswertung) live sehen ohne Reload — analog zu
-- gutachter_termine + auftraege aus AAR-864.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'claims'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.claims';
  END IF;
END $$;

ALTER TABLE public.claims REPLICA IDENTITY FULL;
