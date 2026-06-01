-- CMM-64 PR1 — Vorschäden/Cardentity entity homes (additive structure only).
-- Vehicle-centric model (CMM-62 decision): cardentity report -> vehicles;
-- prior-damage events -> vehicle_vorschaeden (1:N); claim-time check flags -> claims.
-- 0 live data (vorschaden coverage 0/74) -> no backfill; readers/writers in PR2/PR3.

-- 1) vehicles: vehicle-level cardentity report
--    (abfrage/enriched timestamp reuses existing vehicles.cardentity_letzter_pull -> no dup column)
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS cardentity_report jsonb;

COMMENT ON COLUMN public.vehicles.cardentity_report IS
  'CMM-64: Voller CarDentity-Report (Typ-A + Typ-B + pdfUrl gemerged) fuer diese FIN. Zeitpunkt = cardentity_letzter_pull.';

-- 2) vehicle_vorschaeden: 1:N prior-damage events per vehicle (FIN history)
CREATE TABLE IF NOT EXISTS public.vehicle_vorschaeden (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  schaden_datum date,
  art           text,
  schwere       text,
  quelle        text NOT NULL DEFAULT 'cardentity',
  beschreibung  text,
  rohdaten      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vehicle_vorschaeden IS
  'CMM-64: Vorschaden-Historie pro Fahrzeug (1:N, via FIN/CarDentity). Vehicle-zentrisch (CMM-62-Entscheidung).';

CREATE INDEX IF NOT EXISTS idx_vehicle_vorschaeden_vehicle_id
  ON public.vehicle_vorschaeden(vehicle_id);

-- updated_at via generic helper (same fn faelle/others use)
DROP TRIGGER IF EXISTS trg_vehicle_vorschaeden_updated_at ON public.vehicle_vorschaeden;
CREATE TRIGGER trg_vehicle_vorschaeden_updated_at
  BEFORE UPDATE ON public.vehicle_vorschaeden
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (claim-native: uses claims.sv_id per CMM-60, NOT faelle.sv_id -> no new faelle dependency)
ALTER TABLE public.vehicle_vorschaeden ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_vorschaeden TO authenticated;
GRANT ALL ON public.vehicle_vorschaeden TO service_role;

CREATE POLICY vv_staff_all ON public.vehicle_vorschaeden
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])
  ));

CREATE POLICY vv_select_via_vehicle ON public.vehicle_vorschaeden
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_vorschaeden.vehicle_id
      AND (
        v.current_owner_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.claims c
          JOIN public.sachverstaendige sv ON sv.id = c.sv_id
          WHERE c.vehicle_id = v.id
            AND sv.profile_id = (SELECT auth.uid())
        )
      )
  ));

-- 3) claims: claim-time vorschaden check flags (nullable = "unknown / not checked")
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS hat_vorschaeden boolean,
  ADD COLUMN IF NOT EXISTS vorschaden_geprueft boolean,
  ADD COLUMN IF NOT EXISTS vorschaden_erkannt boolean,
  ADD COLUMN IF NOT EXISTS vorschaeden_beschreibung text;

COMMENT ON COLUMN public.claims.hat_vorschaeden IS 'CMM-64: Claim-Zeitpunkt — relevanter Vorschaden vorhanden (NULL=nicht geprueft).';
COMMENT ON COLUMN public.claims.vorschaden_geprueft IS 'CMM-64: KB/CarDentity-Check fuer diesen Claim durchgefuehrt.';
COMMENT ON COLUMN public.claims.vorschaden_erkannt IS 'CMM-64: CarDentity hat im Claim-Check Vorschaden erkannt.';
COMMENT ON COLUMN public.claims.vorschaeden_beschreibung IS 'CMM-64: Manuelle Vorschaden-Notiz fuer diesen Claim.';
