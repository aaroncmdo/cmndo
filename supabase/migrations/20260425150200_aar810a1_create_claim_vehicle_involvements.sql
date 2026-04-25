-- AAR-810 A.1.3: claim_vehicle_involvements — Sub-Table für Multi-Vehicle-Crashes

CREATE TABLE IF NOT EXISTS public.claim_vehicle_involvements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  vehicle_id          UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  rolle               TEXT NOT NULL CHECK (rolle IN (
    'geschaedigter','verursacher','beteiligter','unbekannt'
  )),
  beschaedigung_grad  TEXT CHECK (beschaedigung_grad IS NULL OR beschaedigung_grad IN (
    'totalschaden','reparaturschaden','bagatelle','keine_beschaedigung'
  )),
  reihenfolge         INTEGER,
  notiz               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uniq_claim_vehicle UNIQUE (claim_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_cvi_claim   ON public.claim_vehicle_involvements(claim_id);
CREATE INDEX IF NOT EXISTS idx_cvi_vehicle ON public.claim_vehicle_involvements(vehicle_id);

COMMENT ON TABLE public.claim_vehicle_involvements IS
  'AAR-810 A.1: Sub-Table für claims mit mehreren beteiligten Vehicles (Multi-Vehicle-Crashes). claims.vehicle_id zeigt auf primäres Vehicle (Geschädigter); diese Sub-Table erfasst alle weiteren Beteiligten.';

ALTER TABLE public.claim_vehicle_involvements ENABLE ROW LEVEL SECURITY;

CREATE POLICY cvi_select_via_claim ON public.claim_vehicle_involvements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = claim_id
    )
  );

CREATE POLICY cvi_staff_all ON public.claim_vehicle_involvements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  );
