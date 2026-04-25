-- AAR-773 Phase 1.2: vehicle_ownership_history

CREATE TABLE IF NOT EXISTS public.vehicle_ownership_history (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id                      UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  user_id                         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  halter_label_anon               TEXT,
  von                             DATE NOT NULL,
  bis                             DATE,
  erwerbsart                      TEXT CHECK (erwerbsart IS NULL OR erwerbsart IN ('kauf','geschenk','erbe','leasing','firmen','unbekannt')),
  kilometerstand_bei_uebernahme   INTEGER CHECK (kilometerstand_bei_uebernahme IS NULL OR kilometerstand_bei_uebernahme >= 0),
  quelle                          TEXT,
  notiz                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_voh_von_vor_bis CHECK (bis IS NULL OR bis >= von)
);

CREATE INDEX IF NOT EXISTS idx_voh_vehicle ON public.vehicle_ownership_history(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_voh_user ON public.vehicle_ownership_history(user_id);

-- Genau ein aktiver Halter pro Vehicle
CREATE UNIQUE INDEX IF NOT EXISTS idx_voh_one_active_owner
  ON public.vehicle_ownership_history(vehicle_id)
  WHERE bis IS NULL;

COMMENT ON TABLE public.vehicle_ownership_history IS 'AAR-773: Halterwechsel-Historie pro Vehicle. Aktiver Halter: Row mit bis IS NULL (per UNIQUE-Index). DSGVO: bei User-Löschung user_id -> NULL und halter_label_anon wird gesetzt.';

ALTER TABLE public.vehicle_ownership_history ENABLE ROW LEVEL SECURITY;

-- Policy: aktueller oder ehemaliger Halter sieht eigene Rows
CREATE POLICY voh_user_own_select ON public.vehicle_ownership_history
  FOR SELECT USING (user_id = auth.uid());

-- Policy: Vehicle-Owner sieht komplette Historie seines Vehicles
CREATE POLICY voh_vehicle_owner_select ON public.vehicle_ownership_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND v.current_owner_id = auth.uid()
    )
  );

-- Policy: Staff alles
CREATE POLICY voh_staff_all ON public.vehicle_ownership_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  );

-- voh_sv_assigned_select wird in File 3 ergänzt, nachdem faelle.vehicle_id existiert.
