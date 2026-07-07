-- Interne Notizen / Kommunikations-Log pro Werkstatt (Admin-CRM-Detailseite, P3a).
-- Nur Staff (admin/dispatch/kb/kanzlei) — die Werkstatt selbst sieht diese Notizen NICHT.

CREATE TABLE IF NOT EXISTS public.werkstatt_notizen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstatt_id uuid NOT NULL REFERENCES public.werkstaetten(id) ON DELETE CASCADE,
  autor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_name text,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_werkstatt_notizen_werkstatt
  ON public.werkstatt_notizen (werkstatt_id, created_at DESC);

ALTER TABLE public.werkstatt_notizen ENABLE ROW LEVEL SECURITY;

-- Interne Notizen: NUR Staff — Werkstatt sieht sie NICHT. anon komplett ausgesperrt.
REVOKE ALL ON public.werkstatt_notizen FROM anon;
GRANT SELECT, INSERT, DELETE ON public.werkstatt_notizen TO authenticated;

CREATE POLICY werkstatt_notizen_staff ON public.werkstatt_notizen
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
