-- AAR-810 A.2.1: claim_parties — alle Beteiligten am Claim als Snapshot

CREATE TABLE IF NOT EXISTS public.claim_parties (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id                        UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  rolle                           TEXT NOT NULL CHECK (rolle IN (
    'geschaedigter','verursacher','fahrer_nicht_halter','beifahrer',
    'zeuge','gegner_airdrop','gutachter_gegen','versicherungssachbearbeiter'
  )),
  reihenfolge                     INTEGER,

  -- User-Verknüpfung
  user_id                         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Identitäts-Snapshot
  anrede                          TEXT,
  titel                           TEXT,
  vorname                         TEXT,
  nachname                        TEXT,
  firma                           TEXT,
  geburtsdatum                    DATE,
  ist_gewerbe                     BOOLEAN NOT NULL DEFAULT FALSE,
  ust_id                          TEXT,

  -- Kontakt
  telefon                         TEXT,
  mobil                           TEXT,
  email                           TEXT,
  adresse_strasse                 TEXT,
  adresse_plz                     VARCHAR(10),
  adresse_ort                     TEXT,
  adresse_land                    VARCHAR(2) NOT NULL DEFAULT 'DE',

  -- Fahrzeug-Bezug
  ist_halter                      BOOLEAN NOT NULL DEFAULT FALSE,
  ist_fahrer                      BOOLEAN NOT NULL DEFAULT FALSE,
  fuehrerscheinklassen            TEXT[],
  fuehrerscheinnummer             TEXT,
  kennzeichen                     VARCHAR(20),
  fahrzeugtyp_klartext            TEXT,
  vehicle_id                      UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,

  -- Versicherung (Gegner)
  versicherung_id                 UUID REFERENCES public.versicherungen(id) ON DELETE SET NULL,
  versicherung_klartext           TEXT,
  versicherungsnummer             TEXT,
  versicherungs_aktenzeichen      TEXT,

  -- Personenschaden
  hat_personenschaden             BOOLEAN NOT NULL DEFAULT FALSE,
  verletzungsart                  TEXT,
  krankenhaus_name                TEXT,
  arbeitsunfaehig_seit            DATE,
  arbeitsunfaehig_bis             DATE,
  ist_fahrzeuginsasse             BOOLEAN,

  -- Airdrop-Workflow (Felder schon hier, Logik in A.3)
  ist_eingeladen_via_airdrop      BOOLEAN NOT NULL DEFAULT FALSE,
  airdrop_token                   VARCHAR(64) UNIQUE,
  airdrop_eingeladen_am           TIMESTAMPTZ,
  airdrop_response_am             TIMESTAMPTZ,

  -- Lifecycle
  ist_aktiv                       BOOLEAN NOT NULL DEFAULT TRUE,
  ist_anonymisiert                BOOLEAN NOT NULL DEFAULT FALSE,
  anonymisiert_am                 TIMESTAMPTZ,

  -- Audit
  quelle                          TEXT NOT NULL CHECK (quelle IN (
    'lead_konvertierung','manuell_kb','sv_besichtigung','airdrop',
    'kunde_self','backfill_aar810_a2','backfill_aar810_a2_zeugen',
    'backfill_aar810_a2_personenschaden'
  )),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notiz                           TEXT,

  -- Geschäftliche Constraints
  CONSTRAINT chk_airdrop_token_only_for_airdrop CHECK (
    (airdrop_token IS NULL AND ist_eingeladen_via_airdrop = FALSE)
    OR (airdrop_token IS NOT NULL AND ist_eingeladen_via_airdrop = TRUE
        AND rolle = 'gegner_airdrop')
  ),
  CONSTRAINT chk_arbeitsunfaehig_konsistenz CHECK (
    arbeitsunfaehig_bis IS NULL OR arbeitsunfaehig_seit IS NULL
    OR arbeitsunfaehig_bis >= arbeitsunfaehig_seit
  ),
  CONSTRAINT chk_anonymisiert_konsistenz CHECK (
    (ist_anonymisiert = FALSE AND anonymisiert_am IS NULL)
    OR (ist_anonymisiert = TRUE AND anonymisiert_am IS NOT NULL)
  )
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_cp_claim          ON public.claim_parties(claim_id);
CREATE INDEX IF NOT EXISTS idx_cp_user           ON public.claim_parties(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cp_rolle_aktiv    ON public.claim_parties(claim_id, rolle) WHERE ist_aktiv = TRUE;
CREATE INDEX IF NOT EXISTS idx_cp_vehicle        ON public.claim_parties(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cp_kennzeichen    ON public.claim_parties(kennzeichen) WHERE kennzeichen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cp_airdrop_token  ON public.claim_parties(airdrop_token) WHERE airdrop_token IS NOT NULL;

-- UNIQUE: pro claim max 1 Geschädigter und 1 Verursacher (aktiv)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cp_geschaedigter_per_claim
  ON public.claim_parties(claim_id)
  WHERE rolle = 'geschaedigter' AND ist_aktiv = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_cp_verursacher_per_claim
  ON public.claim_parties(claim_id)
  WHERE rolle = 'verursacher' AND ist_aktiv = TRUE;

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.set_claim_parties_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_claim_parties_updated_at ON public.claim_parties;
CREATE TRIGGER trg_claim_parties_updated_at
  BEFORE UPDATE ON public.claim_parties
  FOR EACH ROW EXECUTE FUNCTION public.set_claim_parties_updated_at();

-- Anonymisierungs-Trigger: bei ist_anonymisiert=TRUE alle Snapshot-Felder leeren
CREATE OR REPLACE FUNCTION public.anonymisiere_claim_party()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ist_anonymisiert = TRUE AND OLD.ist_anonymisiert = FALSE THEN
    NEW.vorname := NULL;
    NEW.nachname := '(anonymisiert)';
    NEW.geburtsdatum := NULL;
    NEW.telefon := NULL;
    NEW.mobil := NULL;
    NEW.email := NULL;
    NEW.adresse_strasse := NULL;
    NEW.adresse_plz := NULL;
    NEW.adresse_ort := NULL;
    NEW.fuehrerscheinnummer := NULL;
    NEW.versicherungsnummer := NULL;
    NEW.versicherungs_aktenzeichen := NULL;
    NEW.anonymisiert_am := COALESCE(NEW.anonymisiert_am, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_anonymisiere_claim_party ON public.claim_parties;
CREATE TRIGGER trg_anonymisiere_claim_party
  BEFORE UPDATE OF ist_anonymisiert ON public.claim_parties
  FOR EACH ROW EXECUTE FUNCTION public.anonymisiere_claim_party();

COMMENT ON TABLE public.claim_parties IS
  'AAR-810 A.2: Beteiligte am Claim. Hybrid-Modell: Hauptbeteiligte (geschaedigter, verursacher) zusätzlich als Direct-FK auf claims.geschaedigter_party_id/verursacher_party_id für Performance. UNIQUE pro Rolle und claim.';

COMMENT ON COLUMN public.claim_parties.user_id IS
  'FK auf profiles. NULL bei Snapshot-only (Gegner ohne Account). Wird via Airdrop-Konversion (Phase A.3) später gefüllt.';

COMMENT ON COLUMN public.claim_parties.airdrop_token IS
  'Magic-Link-Token für Gegner-Einladung (Phase A.3). Nur bei rolle=gegner_airdrop nicht NULL.';

-- RLS aktivieren
ALTER TABLE public.claim_parties ENABLE ROW LEVEL SECURITY;

-- Policy 1: User sieht eigene party-Rows vollständig
CREATE POLICY cp_user_own_select ON public.claim_parties
  FOR SELECT USING (user_id = auth.uid());

-- Policy 2: Mitbeteiligte am gleichen claim sehen sich (limitierte Sicht über Safe-View, siehe File 2)
CREATE POLICY cp_co_party_select ON public.claim_parties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.claim_parties cp_self
      WHERE cp_self.claim_id = claim_parties.claim_id
        AND cp_self.user_id = auth.uid()
        AND cp_self.ist_aktiv = TRUE
    )
  );

-- Policy 3: Staff alles
CREATE POLICY cp_staff_all ON public.claim_parties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
  );

-- Policy 4: SV sieht claim_parties seiner zugewiesenen Vehicles via faelle.sv_id
CREATE POLICY cp_sv_assigned_select ON public.claim_parties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.faelle f
      JOIN public.sachverstaendige sv ON sv.id = f.sv_id
      WHERE f.claim_id = claim_parties.claim_id AND sv.profile_id = auth.uid()
    )
  );

-- Policy 5: SV darf Zeugen vor Ort anlegen
CREATE POLICY cp_sv_assigned_insert ON public.claim_parties
  FOR INSERT WITH CHECK (
    rolle = 'zeuge'
    AND EXISTS (
      SELECT 1 FROM public.faelle f
      JOIN public.sachverstaendige sv ON sv.id = f.sv_id
      WHERE f.claim_id = claim_parties.claim_id AND sv.profile_id = auth.uid()
    )
  );
