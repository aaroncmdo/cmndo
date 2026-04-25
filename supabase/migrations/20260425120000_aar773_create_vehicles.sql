-- AAR-773 Phase 1.1: vehicles foundation
-- Master-Spec: AAR-770

-- Helper für sicheres Date-Parsing (text -> date, NULL bei Parse-Fehler)
CREATE OR REPLACE FUNCTION public.safe_to_date(p_text text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE v date;
BEGIN
  IF p_text IS NULL OR trim(p_text) = '' THEN RETURN NULL; END IF;
  -- ISO YYYY-MM-DD oder YYYY-MM-DDTHH:MM:SS
  IF p_text ~ '^\d{4}-\d{2}-\d{2}' THEN
    BEGIN v := substring(p_text, 1, 10)::date; RETURN v;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  -- DD.MM.YYYY
  IF p_text ~ '^\d{1,2}\.\d{1,2}\.\d{4}' THEN
    BEGIN v := to_date(substring(p_text, 1, 10), 'DD.MM.YYYY'); RETURN v;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  -- MM.YYYY (z.B. Cardentity "10.2019")
  IF p_text ~ '^\d{1,2}\.\d{4}$' THEN
    BEGIN v := to_date('01.' || p_text, 'DD.MM.YYYY'); RETURN v;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.safe_to_date IS 'AAR-773: parsed unterschiedliche Date-Strings sicher ohne Exception';

-- vehicles: zentrale Asset-Tabelle, FIN als UNIQUE-Anker
CREATE TABLE IF NOT EXISTS public.vehicles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fin                         VARCHAR(17) UNIQUE NOT NULL CHECK (length(fin) = 17),
  kennzeichen_aktuell         VARCHAR(20),
  hsn                         VARCHAR(4),
  tsn                         VARCHAR(3),

  -- Stammdaten
  hersteller                  TEXT NOT NULL,
  modell_haupttyp             TEXT,
  modell_untertyp             TEXT,
  variante                    TEXT,
  bauart                      TEXT,
  aufbau                      TEXT,
  farbe_klartext              TEXT,
  farbcode                    TEXT,
  ist_metallic                BOOLEAN,

  -- Technisch
  kraftstoff                  TEXT,
  leistung_kw                 INTEGER,
  hubraum_ccm                 INTEGER,
  zylinder                    INTEGER,
  getriebe                    TEXT,
  antriebsart                 TEXT,
  co2_g_km                    INTEGER,
  abgasnorm                   TEXT,
  tuerzahl                    INTEGER,
  achsen                      INTEGER,
  sitze                       INTEGER,

  -- Datierungen
  erstzulassung               DATE,
  baujahr_monat               DATE,
  produktionszeit_von         DATE,
  produktionszeit_bis         DATE,

  -- Maße
  laenge_mm                   INTEGER,
  breite_mm                   INTEGER,
  hoehe_mm                    INTEGER,
  radstand_mm                 INTEGER,
  leermasse_kg                INTEGER,
  zul_gesamtmasse_kg          INTEGER,
  tankvolumen_l               INTEGER,

  -- State
  aktueller_kilometerstand    INTEGER CHECK (aktueller_kilometerstand IS NULL OR aktueller_kilometerstand >= 0),
  aktueller_kilometerstand_at TIMESTAMPTZ,
  status                      TEXT NOT NULL DEFAULT 'aktiv'
                              CHECK (status IN ('aktiv','stillgelegt','verkauft','totalschaden','exportiert')),
  current_owner_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Quellen-Tracking
  zb1_dokument_id             UUID REFERENCES public.fall_dokumente(id) ON DELETE SET NULL,
  cardentity_letzter_pull     TIMESTAMPTZ,
  data_completeness_score     NUMERIC(3,2) CHECK (data_completeness_score IS NULL OR (data_completeness_score >= 0 AND data_completeness_score <= 1)),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON public.vehicles(current_owner_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_kennzeichen ON public.vehicles(kennzeichen_aktuell);
CREATE INDEX IF NOT EXISTS idx_vehicles_hsn_tsn ON public.vehicles(hsn, tsn);
CREATE INDEX IF NOT EXISTS idx_vehicles_status_aktiv ON public.vehicles(status) WHERE status = 'aktiv';

COMMENT ON TABLE public.vehicles IS 'AAR-770/773: Vehicle als zentrale Asset-Entität. FIN als ISO-3779-Anker, UUID als technischer PK.';
COMMENT ON COLUMN public.vehicles.fin IS 'Fahrzeug-Identifizierungsnummer (17 Zeichen, ISO 3779). UNIQUE über alle Vehicles.';
COMMENT ON COLUMN public.vehicles.aktueller_kilometerstand IS 'Letzter bekannter KM-Stand. Wird via Trigger aus vehicle_mileage_readings synchronisiert (Phase 2 / AAR-774).';

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.set_vehicle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_vehicle_updated_at();

-- RLS aktivieren
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Policy 1: Kunde sieht eigene Vehicles
CREATE POLICY vehicles_kunde_own_select ON public.vehicles
  FOR SELECT USING (current_owner_id = auth.uid());

-- Policy 2: Staff (admin/dispatch/KB) sehen alles
CREATE POLICY vehicles_staff_all ON public.vehicles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer')
    )
  );

-- Policy 3 (vehicles_sv_assigned_select) wird in File 3 ergänzt,
-- nachdem faelle.vehicle_id per ADD COLUMN existiert.
