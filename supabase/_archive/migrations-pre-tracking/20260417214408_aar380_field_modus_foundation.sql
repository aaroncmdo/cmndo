-- AAR-380: Gutachter Field-Modus Foundation

-- 1. sv_tages_session
CREATE TABLE IF NOT EXISTS public.sv_tages_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id uuid NOT NULL REFERENCES public.sachverstaendige(id) ON DELETE CASCADE,
  datum date NOT NULL,
  status text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'en_route', 'arrived', 'completing', 'finished', 'paused')),
  aktueller_termin_id uuid REFERENCES public.gutachter_termine(id) ON DELETE SET NULL,
  reihenfolge_termin_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sv_id, datum)
);

CREATE INDEX IF NOT EXISTS idx_sv_tages_session_sv_status ON public.sv_tages_session(sv_id, status);
CREATE INDEX IF NOT EXISTS idx_sv_tages_session_datum ON public.sv_tages_session(datum);

ALTER TABLE public.sv_tages_session ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sv_tages_session' AND policyname='sv_tages_session_sv_own') THEN
    CREATE POLICY "sv_tages_session_sv_own" ON public.sv_tages_session FOR ALL USING (sv_id = public.get_sv_id()) WITH CHECK (sv_id = public.get_sv_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sv_tages_session' AND policyname='sv_tages_session_staff_read') THEN
    CREATE POLICY "sv_tages_session_staff_read" ON public.sv_tages_session FOR SELECT USING (public.is_staff());
  END IF;
END$$;

DROP TRIGGER IF EXISTS set_sv_tages_session_updated_at ON public.sv_tages_session;
CREATE TRIGGER set_sv_tages_session_updated_at BEFORE UPDATE ON public.sv_tages_session FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.sv_tages_session IS 'AAR-380: Field-Modus Session-State pro SV/Tag. Überlebt Tab-Wechsel und Reload.';

-- 2. kunde_live_position
CREATE TABLE IF NOT EXISTS public.kunde_live_position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  termin_id uuid NOT NULL REFERENCES public.gutachter_termine(id) ON DELETE CASCADE,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  accuracy_m numeric,
  speed_kmh numeric,
  distance_to_target_meters integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kunde_id, termin_id)
);

ALTER TABLE public.kunde_live_position ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kunde_live_position' AND policyname='kunde_live_position_own') THEN
    CREATE POLICY "kunde_live_position_own" ON public.kunde_live_position FOR ALL USING (kunde_id = auth.uid()) WITH CHECK (kunde_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kunde_live_position' AND policyname='kunde_live_position_sv_view') THEN
    CREATE POLICY "kunde_live_position_sv_view" ON public.kunde_live_position FOR SELECT USING (EXISTS (SELECT 1 FROM public.gutachter_termine gt WHERE gt.id = kunde_live_position.termin_id AND gt.sv_id = public.get_sv_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kunde_live_position' AND policyname='kunde_live_position_staff_read') THEN
    CREATE POLICY "kunde_live_position_staff_read" ON public.kunde_live_position FOR SELECT USING (public.is_staff());
  END IF;
END$$;

DROP TRIGGER IF EXISTS set_kunde_live_position_updated_at ON public.kunde_live_position;
CREATE TRIGGER set_kunde_live_position_updated_at BEFORE UPDATE ON public.kunde_live_position FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.kunde_live_position IS 'AAR-380: Live-Position des Kunden auf Anfahrt. Symmetrie zu sv_live_position.';

-- 3. Kunden-Felder auf gutachter_termine
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS kunde_tracking_aktiviert boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS kunde_losgefahren_am timestamptz,
  ADD COLUMN IF NOT EXISTS kunde_eta_minuten integer,
  ADD COLUMN IF NOT EXISTS kunde_eta_letzte_berechnung timestamptz,
  ADD COLUMN IF NOT EXISTS kunde_angekommen_am timestamptz,
  ADD COLUMN IF NOT EXISTS kunde_verspaetung_gemeldet_am timestamptz;

COMMENT ON COLUMN public.gutachter_termine.kunde_tracking_aktiviert IS 'AAR-380: Kunde hat Live-Tracking per Opt-In aktiviert.';

-- 4. Strukturierter SV-Briefing-JSON
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS sv_briefing_struktur jsonb;

COMMENT ON COLUMN public.faelle.sv_briefing_struktur IS 'AAR-380/385: Strukturiertes KI-Briefing als jsonb — { kurzversion, hinweise[], warnungen[], checkliste_vor_ort[] }.';

-- 5. Realtime-Publikation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='sv_tages_session') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sv_tages_session';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='kunde_live_position') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.kunde_live_position';
  END IF;
END$$;;
