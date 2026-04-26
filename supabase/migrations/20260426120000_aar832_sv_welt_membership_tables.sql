-- AAR-832: SV-Welt — Membership-Modell für Büros, Organisationen, Communities
--
-- sachverstaendige existiert bereits (reichhaltige Tabelle aus früheren Migrations).
-- Hier nur fehlende Spec-Felder ergänzen + neue Membership-Tabellen anlegen.

-- ─── sachverstaendige — fehlende Spec-Felder ergänzen ───────────────────────

ALTER TABLE public.sachverstaendige
  ADD COLUMN IF NOT EXISTS oeffentlich_bestellt    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bestellungs_kammer      TEXT,
  ADD COLUMN IF NOT EXISTS arbeitet_eigenstaendig  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS kapazitaeten_jsonb       JSONB;

COMMENT ON COLUMN public.sachverstaendige.oeffentlich_bestellt IS
  'AAR-832: Öffentlich bestellter und vereidigter SV (z.B. IHK/HWK-Bestellung).';
COMMENT ON COLUMN public.sachverstaendige.bestellungs_kammer IS
  'AAR-832: z.B. "IHK Berlin", "HWK München". Nur relevant wenn oeffentlich_bestellt=TRUE.';
COMMENT ON COLUMN public.sachverstaendige.arbeitet_eigenstaendig IS
  'AAR-832: TRUE = eigenständiger SV. FALSE = ausschließlich über Büro/Organisation tätig.';
COMMENT ON COLUMN public.sachverstaendige.kapazitaeten_jsonb IS
  'AAR-832: Aktuelle Kapazität — z.B. {offene_auftraege: 3, max_auftraege: 5}. '
  'Auto-Match halbiert Score wenn offene_auftraege > 5.';

-- ─── sv_buero — Zusammenschluss mehrerer SVs ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sv_buero (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  rechtsform                  TEXT CHECK (rechtsform IN ('GmbH','GbR','Einzelunternehmen','UG','AG','e.K.','KG','OHG')),
  ust_id                      TEXT,
  adresse_strasse             TEXT,
  adresse_plz                 VARCHAR(5),
  adresse_ort                 TEXT,
  adresse_land                VARCHAR(2) NOT NULL DEFAULT 'DE',
  telefon                     TEXT,
  email                       TEXT,
  geo_lat                     NUMERIC(10,7),
  geo_lng                     NUMERIC(10,7),
  aggregierte_rechnungsstellung BOOLEAN NOT NULL DEFAULT FALSE,
  status                      TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','pausiert','deaktiviert')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notiz                       TEXT
);

ALTER TABLE public.sv_buero ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_sv_buero_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_sv_buero_updated_at ON public.sv_buero;
CREATE TRIGGER trg_sv_buero_updated_at
  BEFORE UPDATE ON public.sv_buero
  FOR EACH ROW EXECUTE FUNCTION public.set_sv_buero_updated_at();

CREATE POLICY sv_buero_admin_all ON public.sv_buero FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
-- sv_buero_member_select wird nach sv_buero_memberships angelegt (weiter unten)

COMMENT ON TABLE public.sv_buero IS
  'AAR-832: SV-Büros — Zusammenschlüsse mehrerer eigenständiger SVs unter einem Büro-Admin. '
  'Büro-Admin sieht alle Gutachten der Büro-Mitglieder. SVs handeln eigenständig.';

-- ─── sv_buero_memberships ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sv_buero_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id       UUID NOT NULL REFERENCES public.sachverstaendige(id) ON DELETE CASCADE,
  buero_id    UUID NOT NULL REFERENCES public.sv_buero(id) ON DELETE CASCADE,
  rolle       TEXT NOT NULL CHECK (rolle IN ('mitglied','admin','partner')),
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sv_id, buero_id, start_date),
  CONSTRAINT chk_svbuero_end_after_start CHECK (end_date IS NULL OR end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_svbuero_sv       ON public.sv_buero_memberships(sv_id);
CREATE INDEX IF NOT EXISTS idx_svbuero_buero    ON public.sv_buero_memberships(buero_id);
CREATE INDEX IF NOT EXISTS idx_svbuero_aktiv    ON public.sv_buero_memberships(sv_id, buero_id) WHERE end_date IS NULL;

ALTER TABLE public.sv_buero_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY svbuero_mem_admin_all ON public.sv_buero_memberships FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY svbuero_mem_member_select ON public.sv_buero_memberships FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sachverstaendige sv
    WHERE sv.id = sv_buero_memberships.sv_id AND sv.profile_id = auth.uid()
  )
);
CREATE POLICY svbuero_mem_bueroadmin_all ON public.sv_buero_memberships FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.sv_buero_memberships m2
    JOIN public.sachverstaendige sv ON sv.id = m2.sv_id
    WHERE m2.buero_id = sv_buero_memberships.buero_id
      AND sv.profile_id = auth.uid()
      AND m2.rolle = 'admin'
      AND m2.end_date IS NULL
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sv_buero_memberships m2
    JOIN public.sachverstaendige sv ON sv.id = m2.sv_id
    WHERE m2.buero_id = sv_buero_memberships.buero_id
      AND sv.profile_id = auth.uid()
      AND m2.rolle = 'admin'
      AND m2.end_date IS NULL
  )
);

COMMENT ON TABLE public.sv_buero_memberships IS
  'AAR-832: Many-to-many SV ↔ Büro. Rollen: mitglied (handelt eigenständig), '
  'admin (sieht Büro-Aggregat), partner (assoziiert).';

-- sv_buero_member_select nach Anlage von sv_buero_memberships
CREATE POLICY sv_buero_member_select ON public.sv_buero FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sv_buero_memberships m
    JOIN public.sachverstaendige sv ON sv.id = m.sv_id
    WHERE m.buero_id = sv_buero.id
      AND sv.profile_id = auth.uid()
      AND m.end_date IS NULL
  )
);

-- ─── sv_organisation — SV mit Läufern ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sv_organisation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  inhaber_sv_id   UUID NOT NULL REFERENCES public.sachverstaendige(id) ON DELETE RESTRICT,
  rechtsform      TEXT,
  ust_id          TEXT,
  adresse_strasse TEXT,
  adresse_plz     VARCHAR(5),
  adresse_ort     TEXT,
  adresse_land    VARCHAR(2) NOT NULL DEFAULT 'DE',
  telefon         TEXT,
  email           TEXT,
  geo_lat         NUMERIC(10,7),
  geo_lng         NUMERIC(10,7),
  status          TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','pausiert','deaktiviert')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notiz           TEXT
);

ALTER TABLE public.sv_organisation ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_sv_org_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_sv_org_updated_at ON public.sv_organisation;
CREATE TRIGGER trg_sv_org_updated_at
  BEFORE UPDATE ON public.sv_organisation
  FOR EACH ROW EXECUTE FUNCTION public.set_sv_org_updated_at();

CREATE POLICY sv_org_admin_all ON public.sv_organisation FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY sv_org_inhaber_all ON public.sv_organisation FOR ALL USING (
  inhaber_sv_id IN (
    SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
  )
) WITH CHECK (
  inhaber_sv_id IN (
    SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
  )
);

COMMENT ON TABLE public.sv_organisation IS
  'AAR-832: SV-Organisationen — SV-Inhaber mit Läufern (Hilfskräfte die vor Ort Fotos + '
  'Daten sammeln). Inhaber kompiliert und unterzeichnet das Gutachten.';

-- ─── sv_organisation_memberships ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sv_organisation_memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organisation_id  UUID NOT NULL REFERENCES public.sv_organisation(id) ON DELETE CASCADE,
  rolle            TEXT NOT NULL CHECK (rolle IN ('inhaber_sv','laeufer','admin_org')),
  einsatzgebiet_geo JSONB,
  start_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date         DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organisation_id, start_date),
  CONSTRAINT chk_svorg_end_after_start CHECK (end_date IS NULL OR end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_svorgmem_user    ON public.sv_organisation_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_svorgmem_org     ON public.sv_organisation_memberships(organisation_id);
CREATE INDEX IF NOT EXISTS idx_svorgmem_aktiv   ON public.sv_organisation_memberships(user_id) WHERE end_date IS NULL;

ALTER TABLE public.sv_organisation_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY svorgmem_admin_all ON public.sv_organisation_memberships FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY svorgmem_self_select ON public.sv_organisation_memberships FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY svorgmem_inhaber_all ON public.sv_organisation_memberships FOR ALL USING (
  organisation_id IN (
    SELECT o.id FROM public.sv_organisation o
    JOIN public.sachverstaendige sv ON sv.id = o.inhaber_sv_id
    WHERE sv.profile_id = auth.uid()
  )
) WITH CHECK (
  organisation_id IN (
    SELECT o.id FROM public.sv_organisation o
    JOIN public.sachverstaendige sv ON sv.id = o.inhaber_sv_id
    WHERE sv.profile_id = auth.uid()
  )
);

COMMENT ON TABLE public.sv_organisation_memberships IS
  'AAR-832: Many-to-many User ↔ SV-Organisation. Rollen: inhaber_sv (besitzt Org), '
  'laeufer (Vor-Ort-Hilfskraft), admin_org (Organisations-Verwaltung).';

-- ─── sv_organisation_laeufer_reports ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sv_organisation_laeufer_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laeufer_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  organisation_id  UUID NOT NULL REFERENCES public.sv_organisation(id) ON DELETE CASCADE,
  claim_id         UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'aufgenommen' CHECK (status IN (
                     'aufgenommen','an_sv_uebergeben','sv_freigegeben'
                   )),
  fotos_count      INTEGER NOT NULL DEFAULT 0,
  daten_jsonb      JSONB,
  notiz            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laeufer_reports_claim    ON public.sv_organisation_laeufer_reports(claim_id);
CREATE INDEX IF NOT EXISTS idx_laeufer_reports_laeufer  ON public.sv_organisation_laeufer_reports(laeufer_user_id);
CREATE INDEX IF NOT EXISTS idx_laeufer_reports_offen    ON public.sv_organisation_laeufer_reports(status) WHERE status = 'aufgenommen';

ALTER TABLE public.sv_organisation_laeufer_reports ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_laeufer_report_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_laeufer_report_updated_at ON public.sv_organisation_laeufer_reports;
CREATE TRIGGER trg_laeufer_report_updated_at
  BEFORE UPDATE ON public.sv_organisation_laeufer_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_laeufer_report_updated_at();

CREATE POLICY laeufer_report_admin_all ON public.sv_organisation_laeufer_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY laeufer_report_self ON public.sv_organisation_laeufer_reports
  FOR ALL USING (laeufer_user_id = auth.uid())
  WITH CHECK (laeufer_user_id = auth.uid());
CREATE POLICY laeufer_report_inhaber ON public.sv_organisation_laeufer_reports FOR SELECT USING (
  organisation_id IN (
    SELECT o.id FROM public.sv_organisation o
    JOIN public.sachverstaendige sv ON sv.id = o.inhaber_sv_id
    WHERE sv.profile_id = auth.uid()
  )
);

COMMENT ON TABLE public.sv_organisation_laeufer_reports IS
  'AAR-832: Läufer-Reports — Vor-Ort-Datensammlung durch Läufer, übergabe an SV-Inhaber '
  'zur Gutachten-Kompilierung. Status-Flow: aufgenommen → an_sv_uebergeben → sv_freigegeben.';

-- ─── sv_community (Stub für Welle 7 — UI kommt später) ───────────────────────

CREATE TABLE IF NOT EXISTS public.sv_community (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  beschreibung TEXT,
  status      TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','archiviert')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sv_community ENABLE ROW LEVEL SECURITY;

CREATE POLICY sv_community_admin_all ON public.sv_community FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);

COMMENT ON TABLE public.sv_community IS
  'AAR-832: SV-Communities (Einkaufsgemeinschaften) — Schema-Stub. '
  'UI und Membership-Logik kommen später. Nicht aktiv in Welle 7.';
