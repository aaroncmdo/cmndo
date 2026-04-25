-- AAR-773 Phase 1.3: vehicle_id-FK auf faelle und leads ergänzen (nullable)

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_faelle_vehicle ON public.faelle(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_leads_vehicle  ON public.leads(vehicle_id);

COMMENT ON COLUMN public.faelle.vehicle_id IS 'AAR-773: FK auf vehicles. Nullable in Phase 1, NOT NULL ab Phase 7. Vehicle-Stammdaten werden in Phase 7 von faelle nach vehicles migriert (löst AAR-652).';
COMMENT ON COLUMN public.leads.vehicle_id IS 'AAR-773: FK auf vehicles. Nullable in Phase 1, NOT NULL ab Phase 7.';

-- SV-Policies jetzt hier ergänzen, wo faelle.vehicle_id existiert

CREATE POLICY vehicles_sv_assigned_select ON public.vehicles
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.faelle f
      JOIN public.sachverstaendige sv ON sv.id = f.sv_id
      WHERE f.vehicle_id = vehicles.id
        AND sv.profile_id = auth.uid()
    )
  );

CREATE POLICY voh_sv_assigned_select ON public.vehicle_ownership_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.faelle f
      JOIN public.sachverstaendige sv ON sv.id = f.sv_id
      WHERE f.vehicle_id = vehicle_ownership_history.vehicle_id
        AND sv.profile_id = auth.uid()
    )
  );
