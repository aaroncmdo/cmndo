-- CMM-44 MP-8: claims.status-CHECK additiv um terminale Endzustaende erweitern.
-- Bestehende Werte bleiben gueltig (reguliert/abgelehnt = Backfill-/Uebergangsfenster).
-- Appliziert via Supabase-Plugin apply_migration (AGENTS.md Regel 2), recorded version 20260529102802.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'public.claims'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%'
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.claims DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.claims ADD CONSTRAINT claims_status_check
  CHECK (status = ANY (ARRAY[
    'dispatch_done','in_bearbeitung','in_kommunikation_vs',
    'reguliert','abgelehnt','an_externe_kanzlei_uebergeben','storniert',
    'reguliert_vollstaendig','klage_rechtsstreit','verjaehrt','abgelehnt_final'
  ]::text[]));
