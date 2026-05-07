-- AAR-872: SV-Privat-Stops aus GCal/CalDAV als Tagesroute-Anker.
-- Tabelle persistiert die Auswahl des SV (welche privaten Termine in die
-- Tagesroute fliessen) inkl. geocodete lat/lng — damit kein wiederholter
-- API-Call beim Laden der Heute-Page noetig ist.

CREATE TABLE IF NOT EXISTS public.sv_private_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id uuid NOT NULL REFERENCES public.sachverstaendige(id) ON DELETE CASCADE,
  datum date NOT NULL,
  source text NOT NULL CHECK (source IN ('gcal', 'caldav')),
  external_event_id text NOT NULL,
  titel text,
  start_zeit timestamptz NOT NULL,
  end_zeit timestamptz NOT NULL,
  address text NOT NULL,
  place_id text,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sv_private_stops_zeit_chk CHECK (end_zeit > start_zeit)
);

-- Verhindert Duplikate wenn der SV im Sheet zweimal denselben Event addet.
CREATE UNIQUE INDEX IF NOT EXISTS sv_private_stops_event_uq
  ON public.sv_private_stops (sv_id, source, external_event_id, datum);

-- Hot-Path: Heute-Page laedt private Stops fuer (sv_id, datum).
CREATE INDEX IF NOT EXISTS sv_private_stops_sv_datum_idx
  ON public.sv_private_stops (sv_id, datum);

-- updated_at Auto-Touch
CREATE OR REPLACE FUNCTION public.sv_private_stops_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sv_private_stops_touch_trg ON public.sv_private_stops;
CREATE TRIGGER sv_private_stops_touch_trg
  BEFORE UPDATE ON public.sv_private_stops
  FOR EACH ROW EXECUTE FUNCTION public.sv_private_stops_touch_updated_at();

-- RLS: SV liest/schreibt nur eigene Rows. Dispatch (Phase 2 / AAR-873) bekommt
-- spaeter einen separaten Read-only-Policy.
ALTER TABLE public.sv_private_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sv_private_stops_self_select ON public.sv_private_stops;
CREATE POLICY sv_private_stops_self_select ON public.sv_private_stops
  FOR SELECT TO authenticated
  USING (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sv_private_stops_self_insert ON public.sv_private_stops;
CREATE POLICY sv_private_stops_self_insert ON public.sv_private_stops
  FOR INSERT TO authenticated
  WITH CHECK (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sv_private_stops_self_update ON public.sv_private_stops;
CREATE POLICY sv_private_stops_self_update ON public.sv_private_stops
  FOR UPDATE TO authenticated
  USING (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  )
  WITH CHECK (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sv_private_stops_self_delete ON public.sv_private_stops;
CREATE POLICY sv_private_stops_self_delete ON public.sv_private_stops
  FOR DELETE TO authenticated
  USING (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  );

COMMENT ON TABLE public.sv_private_stops IS
  'AAR-872: SV-Privat-Termine aus GCal/CalDAV als Tagesroute-Stops mit gecachetem lat/lng.';
