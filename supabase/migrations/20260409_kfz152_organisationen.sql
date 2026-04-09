-- KFZ-152 Phase 1: Organisationen (Buero/Akademie/Community) Erweiterung
-- Erweitert die existierende minimale 'organisationen' Tabelle (id/name/parent_user_id)
-- statt eine neue 'gutachter_organisationen' anzulegen — sachverstaendige.organisation_id
-- zeigt bereits auf 'organisationen'.

-- ── 1. organisationen erweitern ─────────────────────────────────────────────
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS typ TEXT NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS rechtsform TEXT NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS anschrift TEXT NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS steuernummer TEXT NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS ust_id TEXT NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS hauptansprechpartner_user_id UUID NULL;

-- Zentrale Stripe-Verknuepfung (Buero: Parent zahlt zentral)
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS parent_stripe_customer_id TEXT NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS parent_stripe_default_pm_id TEXT NULL;

-- Akademie/Community gemeinsames Einsatzgebiet
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS einsatzgebiet_isochron_geojson JSONB NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS einsatzgebiet_radius_km NUMERIC(6,2) NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS einsatzgebiet_zentrum_lat NUMERIC(10,6) NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS einsatzgebiet_zentrum_lng NUMERIC(10,6) NULL;

-- Akademie spezifisch
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS akademie_max_faelle_monat INT NULL;

-- Community spezifisch
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS community_exklusiv BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS community_max_faelle_monat INT NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS community_leaderboard_aktiv BOOLEAN NOT NULL DEFAULT true;

-- Onboarding
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS vertrag_unterzeichnet_id UUID NULL REFERENCES vertraege_unterzeichnet(id);
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- CHECK Constraints (erstellt nur wenn nicht vorhanden)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_organisationen_typ') THEN
    ALTER TABLE organisationen ADD CONSTRAINT chk_organisationen_typ CHECK (
      typ IS NULL OR typ IN ('einzel','buero','akademie','community')
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_organisationen_onboarding_status') THEN
    ALTER TABLE organisationen ADD CONSTRAINT chk_organisationen_onboarding_status CHECK (
      onboarding_status IN ('pending','vertrag_unterzeichnet','anzahlung_offen','aktiv','blockiert')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_typ ON organisationen(typ);
CREATE INDEX IF NOT EXISTS idx_org_onboarding_status ON organisationen(onboarding_status);

-- ── 2. sachverstaendige.rolle_in_organisation ─────────────────────────────
-- (organisation_id existiert bereits, ist_parent_account auch)
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS rolle_in_organisation TEXT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sv_rolle_in_organisation') THEN
    ALTER TABLE sachverstaendige ADD CONSTRAINT chk_sv_rolle_in_organisation CHECK (
      rolle_in_organisation IS NULL OR rolle_in_organisation IN (
        'inhaber','buero_admin','mitarbeiter','community_member','akademie_sub'
      )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sv_organisation ON sachverstaendige(organisation_id) WHERE organisation_id IS NOT NULL;

-- ── 3. community_leaderboard ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisationen(id) ON DELETE CASCADE,
  sv_id UUID NOT NULL REFERENCES sachverstaendige(id) ON DELETE CASCADE,
  zeitraum_monat INT NOT NULL,
  zeitraum_jahr INT NOT NULL,
  faelle_count INT NOT NULL DEFAULT 0,
  umsatz_netto NUMERIC(10,2) NOT NULL DEFAULT 0,
  durchschnitt_bearbeitungsdauer_h NUMERIC(6,2) NULL,
  rang INT NULL,
  letzte_aktualisierung TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, sv_id, zeitraum_monat, zeitraum_jahr)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_org_zeit
  ON community_leaderboard(organisation_id, zeitraum_jahr, zeitraum_monat);

-- ── 4. gebiet_exklusivitaeten ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gebiet_exklusivitaeten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisationen(id) ON DELETE CASCADE,
  isochron_geojson JSONB NOT NULL,
  aktiv_seit TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktiv_bis TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exkl_org ON gebiet_exklusivitaeten(organisation_id);
CREATE INDEX IF NOT EXISTS idx_exkl_aktiv ON gebiet_exklusivitaeten(organisation_id) WHERE aktiv_bis IS NULL;

-- ── 5. RLS auf den neuen Tabellen ──────────────────────────────────────────
ALTER TABLE community_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE gebiet_exklusivitaeten ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access community_leaderboard') THEN
    CREATE POLICY "Admin full access community_leaderboard"
      ON community_leaderboard FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'SV sieht eigene Community') THEN
    CREATE POLICY "SV sieht eigene Community"
      ON community_leaderboard FOR SELECT
      USING (
        organisation_id IN (
          SELECT organisation_id FROM sachverstaendige
          WHERE profile_id = auth.uid() AND organisation_id IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access gebiet_exklusivitaeten') THEN
    CREATE POLICY "Admin full access gebiet_exklusivitaeten"
      ON gebiet_exklusivitaeten FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin'));
  END IF;
END $$;

-- ── 6. vertraege_unterzeichnet bekommt optionale organisation_id ───────────
-- Damit Buero/Akademie als juristische Person unterzeichnen koennen ohne dass
-- der Vertrag an einen einzelnen SV gehaengt werden muss.
ALTER TABLE vertraege_unterzeichnet ADD COLUMN IF NOT EXISTS organisation_id UUID NULL REFERENCES organisationen(id) ON DELETE SET NULL;
ALTER TABLE vertraege_unterzeichnet ALTER COLUMN gutachter_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vertrag_target') THEN
    ALTER TABLE vertraege_unterzeichnet ADD CONSTRAINT chk_vertrag_target CHECK (
      gutachter_id IS NOT NULL OR organisation_id IS NOT NULL
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vertraege_org ON vertraege_unterzeichnet(organisation_id) WHERE organisation_id IS NOT NULL;
