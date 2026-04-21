-- AAR-kanzlei-termin: Kanzlei-Admin-Beratungstermine.
--
-- Kanzlei-Nutzer buchen einen Video- oder Vor-Ort-Termin mit einem Admin.
-- Google-Meet-Link + Admin-Kalender-Event werden von lib/google-calendar/events.ts
-- synchron erzeugt; google_event_id + google_meet_link hier gespiegelt, damit
-- die Kanzlei den Link ohne Mail-Rückgriff sieht und der Admin beim Storno
-- das Event wieder löschen kann.
--
-- Kein fall_id-Pflichtfeld — Kanzlei kann auch allgemeine Rückfragen buchen.

CREATE TABLE IF NOT EXISTS public.kanzlei_admin_termine (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kanzlei_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  fall_id      uuid NULL REFERENCES public.faelle(id) ON DELETE SET NULL,
  start_zeit   timestamptz NOT NULL,
  end_zeit     timestamptz NOT NULL,
  typ          text NOT NULL CHECK (typ IN ('video','vor_ort')),
  titel        text NOT NULL,
  beschreibung text NULL,
  status       text NOT NULL DEFAULT 'gebucht'
               CHECK (status IN ('gebucht','abgesagt','durchgefuehrt')),
  google_event_id   text NULL,
  google_meet_link  text NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kanzlei_admin_termine_admin
  ON public.kanzlei_admin_termine (admin_user_id, start_zeit);
CREATE INDEX IF NOT EXISTS idx_kanzlei_admin_termine_kanzlei
  ON public.kanzlei_admin_termine (kanzlei_user_id, start_zeit);
CREATE INDEX IF NOT EXISTS idx_kanzlei_admin_termine_fall
  ON public.kanzlei_admin_termine (fall_id);

-- Updated-At-Trigger (Standard-Claimondo-Pattern)
CREATE OR REPLACE FUNCTION public.trg_kanzlei_admin_termine_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kanzlei_admin_termine_updated_at ON public.kanzlei_admin_termine;
CREATE TRIGGER trg_kanzlei_admin_termine_updated_at
  BEFORE UPDATE ON public.kanzlei_admin_termine
  FOR EACH ROW EXECUTE FUNCTION public.trg_kanzlei_admin_termine_updated_at();

-- RLS
ALTER TABLE public.kanzlei_admin_termine ENABLE ROW LEVEL SECURITY;

-- Kanzlei: nur eigene Termine + die des eigenen Users
DROP POLICY IF EXISTS "Kanzlei liest eigene Termine" ON public.kanzlei_admin_termine;
CREATE POLICY "Kanzlei liest eigene Termine"
ON public.kanzlei_admin_termine
FOR SELECT
USING (
  kanzlei_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rolle = 'kanzlei'::user_role
  )
);

-- Kanzlei: eigene Termine anlegen
DROP POLICY IF EXISTS "Kanzlei legt Termine an" ON public.kanzlei_admin_termine;
CREATE POLICY "Kanzlei legt Termine an"
ON public.kanzlei_admin_termine
FOR INSERT
WITH CHECK (
  kanzlei_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rolle = 'kanzlei'::user_role
  )
);

-- Kanzlei: eigene Termine absagen (status updaten). Andere Felder über
-- Server-Action mit Admin-Client.
DROP POLICY IF EXISTS "Kanzlei saegt eigene Termine ab" ON public.kanzlei_admin_termine;
CREATE POLICY "Kanzlei saegt eigene Termine ab"
ON public.kanzlei_admin_termine
FOR UPDATE
USING (
  kanzlei_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rolle = 'kanzlei'::user_role
  )
)
WITH CHECK (
  kanzlei_user_id = auth.uid()
);

-- Admin: sieht alle. Bearbeitet via Server-Action mit Service-Key.
DROP POLICY IF EXISTS "Admin liest alle Kanzlei-Termine" ON public.kanzlei_admin_termine;
CREATE POLICY "Admin liest alle Kanzlei-Termine"
ON public.kanzlei_admin_termine
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rolle = 'admin'::user_role
  )
);
