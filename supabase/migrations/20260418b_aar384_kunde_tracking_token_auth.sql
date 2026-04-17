-- AAR-384: Kunden-Geotracking — der öffentliche Tracking-Flow über
-- /kunde/termin/[token] ist UNAUTHENTICATED (Kunde hat keinen auth user).
-- Die Ursprungs-Migration (AAR-380) hat kunde_live_position.kunde_id als
-- NOT NULL mit FK auf auth.users — das passt für authentifizierte Kunden,
-- blockiert aber den Token-Flow. Wir lockern die Constraint:
--   - kunde_id darf NULL sein (Token-Flow)
--   - UNIQUE über (termin_id) bleibt eindeutig (ein Live-Eintrag pro Termin)
-- Der Server-Action schreibt via Admin-Client (service_role), verifiziert
-- den Token gegen gutachter_termine.kunden_tracking_token vor jedem Write.

ALTER TABLE public.kunde_live_position
  ALTER COLUMN kunde_id DROP NOT NULL;

-- Alte UNIQUE (kunde_id, termin_id) ist bei kunde_id=NULL nicht eindeutig
-- genug — einfach eine UNIQUE nur auf termin_id ergänzen (Ein Eintrag pro
-- Termin reicht — aktueller Stand).
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
  'Auth-User-ID des Kunden falls eingeloggt. NULL für Token-Flow (AAR-384) — Server-Action verifiziert dann gutachter_termine.kunden_tracking_token.';
