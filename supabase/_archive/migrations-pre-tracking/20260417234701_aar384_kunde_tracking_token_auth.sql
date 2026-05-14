-- AAR-384: Kunden-Geotracking — Token-Flow Auth-Lockerung
ALTER TABLE public.kunde_live_position
  ALTER COLUMN kunde_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kunde_live_position_termin_id_key'
  ) THEN
    ALTER TABLE public.kunde_live_position
      ADD CONSTRAINT kunde_live_position_termin_id_key UNIQUE (termin_id);
  END IF;
END$$;

COMMENT ON COLUMN public.kunde_live_position.kunde_id IS
  'Auth-User-ID des Kunden falls eingeloggt. NULL für Token-Flow (AAR-384) — Server-Action verifiziert dann gutachter_termine.kunden_tracking_token.';;
