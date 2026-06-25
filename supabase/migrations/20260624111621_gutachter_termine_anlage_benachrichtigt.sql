-- AAR-956 Auto-Beratungstermin: Sent-Tracking fuer die proaktive Anlage-Benachrichtigung
-- (Email an den Kunden bei Termin-Anlage). Nullable, kein Default. Cron setzt es nach Versand.
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS anlage_benachrichtigt_at timestamptz;
