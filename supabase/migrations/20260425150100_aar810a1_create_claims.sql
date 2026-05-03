-- AAR-810 A.1.2: claims — Schadensereignis als eigenständiges Asset

CREATE TABLE IF NOT EXISTS public.claims (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vehicle-Referenz (nullable in A.1, NN ab Phase 4 / AAR-776)
  vehicle_id                      UUID REFERENCES public.vehicles(id) ON DELETE RESTRICT,

  -- Schadensereignis (was, wann, wo)
  schadentag                      DATE NOT NULL,
  schadenzeit                     TIME,
  entdeckt_am                     DATE,
  schadenort_adresse              TEXT,
  schadenort_plz                  VARCHAR(5),
  schadenort_ort                  TEXT,
  schadenort_land                 VARCHAR(2) NOT NULL DEFAULT 'DE',
  schadenort_lat                  NUMERIC(10,7),
  schadenort_lng                  NUMERIC(10,7),
  schadenort_kategorie            TEXT,

  -- Hergang
  hergang_kunde_text              TEXT,
  hergang_sv_text                 TEXT,
  schadenart                      TEXT NOT NULL DEFAULT 'unbekannt'
                                  CHECK (schadenart IN (
                                    'haftpflicht','vollkasko','teilkasko',
                                    'eigenverschulden','unbekannt'
                                  )),
  fall_typ                        TEXT,
  ursache                         TEXT,
  unfall_konstellation            TEXT,
  fahrerflucht                    BOOLEAN,
  auslandskennzeichen             BOOLEAN,

  -- Polizei
  polizei_aktenzeichen            TEXT,
  polizei_bericht_vorhanden       BOOLEAN NOT NULL DEFAULT FALSE,
  polizei_vor_ort                 BOOLEAN NOT NULL DEFAULT FALSE,
  polizeibericht_status           TEXT,
  bkat_unfallart                  TEXT,

  -- Hauptbeteiligte (Direct-FK; claim_parties-Snapshot kommt in A.2)
  geschaedigter_user_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  geschaedigter_party_id          UUID,  -- FK auf claim_parties wird in A.2 nachgezogen
  verursacher_user_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verursacher_party_id            UUID,

  -- Gegnerseite
  gegnerisches_vehicle_id         UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  gegner_versicherung_id          UUID REFERENCES public.versicherungen(id) ON DELETE SET NULL,
  gegner_versicherungsnummer      TEXT,
  gegner_aktenzeichen             TEXT,
  gegner_bekannt                  BOOLEAN NOT NULL DEFAULT TRUE,
  anzahl_beteiligte_total         INTEGER NOT NULL DEFAULT 1 CHECK (anzahl_beteiligte_total >= 1),

  -- Flags
  hat_personenschaden             BOOLEAN NOT NULL DEFAULT FALSE,
  hat_mietwagen                   BOOLEAN NOT NULL DEFAULT FALSE,
  hat_nutzungsausfall             BOOLEAN NOT NULL DEFAULT FALSE,
  hat_sachschaden                 BOOLEAN NOT NULL DEFAULT FALSE,
  hat_abschleppung                BOOLEAN NOT NULL DEFAULT FALSE,
  sachschaden_beschreibung        TEXT,
  halter_ungleich_fahrer          BOOLEAN NOT NULL DEFAULT FALSE,
  kunden_konstellation            TEXT,

  -- Skizze
  unfallskizze_url                TEXT,
  unfallskizze_svg                TEXT,
  unfallskizze_bestaetigt         BOOLEAN,
  unfallskizze_ablehnung_grund    TEXT,
  unfallskizze_generiert_am       TIMESTAMPTZ,

  -- Status (claim-Lifecycle, NICHT faelle-Workflow)
  status                          TEXT NOT NULL DEFAULT 'offen'
                                  CHECK (status IN (
                                    'offen','reguliert_teilweise','reguliert_vollstaendig',
                                    'abgelehnt','verjaehrt','storniert'
                                  )),
  abgeschlossen_am                TIMESTAMPTZ,
  verjaehrt_am                    DATE,

  -- Audit
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_via                     TEXT NOT NULL DEFAULT 'manuell_admin'
                                  CHECK (created_via IN (
                                    'lead_konvertierung','cardentity_befund',
                                    'manuell_admin','airdrop','sv_anlage',
                                    'backfill_aar810_a1'
                                  )),

  -- Geschäftliche Constraints
  CONSTRAINT chk_claims_verjaehrt_nach_schadentag CHECK (
    verjaehrt_am IS NULL OR verjaehrt_am >= schadentag
  ),
  CONSTRAINT chk_claims_abgeschlossen_nach_schadentag CHECK (
    abgeschlossen_am IS NULL OR abgeschlossen_am::date >= schadentag
  ),
  CONSTRAINT chk_claims_eigenverschulden_oder_unterschiedlich CHECK (
    geschaedigter_user_id IS NULL
    OR verursacher_user_id IS NULL
    OR geschaedigter_user_id <> verursacher_user_id
    OR schadenart = 'eigenverschulden'
  )
);

CREATE INDEX IF NOT EXISTS idx_claims_vehicle           ON public.claims(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_claims_geschaedigter     ON public.claims(geschaedigter_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_verursacher       ON public.claims(verursacher_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_schadentag        ON public.claims(schadentag DESC);
CREATE INDEX IF NOT EXISTS idx_claims_status_offen      ON public.claims(status) WHERE status = 'offen';
CREATE INDEX IF NOT EXISTS idx_claims_gegner_versicherung ON public.claims(gegner_versicherung_id);

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.set_claims_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_claims_updated_at ON public.claims;
CREATE TRIGGER trg_claims_updated_at
  BEFORE UPDATE ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.set_claims_updated_at();

-- Auto-Verjährung berechnen (3 Jahre nach Schadentag bei Haftpflicht)
CREATE OR REPLACE FUNCTION public.set_claims_verjaehrung()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verjaehrt_am IS NULL AND NEW.schadenart = 'haftpflicht' THEN
    NEW.verjaehrt_am := NEW.schadentag + INTERVAL '3 years';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_claims_verjaehrung ON public.claims;
CREATE TRIGGER trg_claims_verjaehrung
  BEFORE INSERT OR UPDATE OF schadentag, schadenart ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.set_claims_verjaehrung();

COMMENT ON TABLE public.claims IS
  'AAR-810 A.1: Schadensereignis als eigenständiges Asset (parallel zu vehicles, faelle, gutachten). Lebenszyklus: schadentag bis verjaehrt_am. Kann ohne faelle existieren (Cardentity-Befund, Airdrop-Beitrag).';

COMMENT ON COLUMN public.claims.vehicle_id IS
  'FK auf primäres vehicle des Geschädigten. Nullable in A.1, wird NOT NULL in Phase 4 / AAR-776. Multi-Vehicle-Beteiligungen via claim_vehicle_involvements.';

COMMENT ON COLUMN public.claims.created_via IS
  'Quelle der Claim-Anlage. Wichtig für Audit (z.B. cardentity_befund = ohne unseren Auftrag entstanden).';

-- RLS aktivieren
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Policy 1: Kunde sieht eigene claims (Geschädigter ODER Verursacher)
CREATE POLICY claims_kunde_own_select ON public.claims
  FOR SELECT USING (
    geschaedigter_user_id = auth.uid() OR verursacher_user_id = auth.uid()
  );

-- Policy 2: Staff voll
CREATE POLICY claims_staff_all ON public.claims
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  );

-- Policy 3 (claims_sv_assigned_select) wird in File 4 ergänzt,
-- nachdem faelle.claim_id per ADD COLUMN existiert.
