CREATE TABLE IF NOT EXISTS rechnungs_konfiguration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gueltig_ab DATE NOT NULL,
  gueltig_bis DATE,
  rechnungssteller TEXT NOT NULL CHECK (rechnungssteller IN ('claimondo_gmbh_igr', 'claimondo_gmbh', 'gbr')),
  firmenname TEXT NOT NULL,
  strasse TEXT NOT NULL,
  plz TEXT NOT NULL,
  ort TEXT NOT NULL,
  steuernummer TEXT,
  ust_id TEXT,
  hrb TEXT,
  geschaeftsfuehrer TEXT,
  zahlungsempfaenger_name TEXT NOT NULL,
  zahlungsempfaenger_iban TEXT NOT NULL,
  zahlungsempfaenger_bic TEXT NOT NULL,
  zahlungsempfaenger_bank TEXT NOT NULL,
  zahlungsempfaenger_hinweis TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rechnungs_konfig_gueltig
  ON rechnungs_konfiguration (gueltig_ab, gueltig_bis);

INSERT INTO rechnungs_konfiguration (
  gueltig_ab, rechnungssteller, firmenname, strasse, plz, ort,
  steuernummer, ust_id, hrb, geschaeftsfuehrer,
  zahlungsempfaenger_name, zahlungsempfaenger_iban, zahlungsempfaenger_bic,
  zahlungsempfaenger_bank, zahlungsempfaenger_hinweis, version
) VALUES (
  '2026-04-17',
  'claimondo_gmbh_igr',
  'Claimondo GmbH i.Gr.',
  'Hansaring 10',
  '50670',
  'Köln',
  NULL,
  NULL,
  NULL,
  'Aaron Sprafke, Nicolas Kitta',
  'Kitta & Sprafke GbR',
  'DE45100110012844464931',
  'NTSBDEB1XXX',
  'N26',
  'Zahlungsempfänger: Kitta & Sprafke GbR als Treuhand für Claimondo GmbH i.Gr. (Steuer-Nr. 215/5794/5613, USt-IdNr. DE370498789). Kontoinhaber: Nicolas Kitta.',
  1
)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS sv_onboarding_rechnungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id UUID REFERENCES sachverstaendige(id) ON DELETE SET NULL,
  organisation_id UUID REFERENCES organisationen(id) ON DELETE SET NULL,
  rechnungs_nr TEXT UNIQUE NOT NULL,
  rechnungs_datum DATE NOT NULL DEFAULT CURRENT_DATE,
  leistungs_datum DATE NOT NULL,
  paket TEXT,
  netto_cent INTEGER NOT NULL,
  ust_cent INTEGER NOT NULL,
  brutto_cent INTEGER NOT NULL,
  ust_satz_pct NUMERIC(4,2) NOT NULL DEFAULT 19.00,
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  pdf_storage_path TEXT,
  kv_pdf_storage_path TEXT,
  nb_pdf_storage_path TEXT,
  versendet_am TIMESTAMPTZ,
  typ TEXT NOT NULL CHECK (typ IN ('solo', 'buero', 'akademie')),
  rechnungssteller TEXT NOT NULL DEFAULT 'claimondo_gmbh_igr'
    CHECK (rechnungssteller IN ('claimondo_gmbh_igr', 'claimondo_gmbh', 'gbr')),
  rechnungs_konfiguration_id UUID REFERENCES rechnungs_konfiguration(id),
  konfig_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sv_or_org_required CHECK (sv_id IS NOT NULL OR organisation_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sv_onb_rechnungen_sv ON sv_onboarding_rechnungen(sv_id);
CREATE INDEX IF NOT EXISTS idx_sv_onb_rechnungen_org ON sv_onboarding_rechnungen(organisation_id);
CREATE INDEX IF NOT EXISTS idx_sv_onb_rechnungen_datum ON sv_onboarding_rechnungen(rechnungs_datum);

CREATE TABLE IF NOT EXISTS rechnungs_nr_counter (
  serie TEXT NOT NULL,
  jahr INTEGER NOT NULL,
  laufende_nr INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (serie, jahr)
);

CREATE OR REPLACE FUNCTION next_rechnungs_nr(p_serie TEXT, p_jahr INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nr INTEGER;
BEGIN
  INSERT INTO rechnungs_nr_counter (serie, jahr, laufende_nr, updated_at)
  VALUES (p_serie, p_jahr, 1, now())
  ON CONFLICT (serie, jahr)
  DO UPDATE SET
    laufende_nr = rechnungs_nr_counter.laufende_nr + 1,
    updated_at = now()
  RETURNING laufende_nr INTO v_nr;
  RETURN v_nr;
END;
$$;

COMMENT ON TABLE rechnungs_konfiguration IS
  'AAR-416: Versionierte Rechnungs-Stammdaten (Absender + Zahlungsempfänger). Single Source of Truth für Setup-Anzahlungs- und Monatsabrechnungs-PDFs.';
COMMENT ON TABLE sv_onboarding_rechnungen IS
  'AAR-401/416: Archiv der Setup-Anzahlungs-Rechnungen (CM-ONB-YYYY-NNNNN).';
COMMENT ON FUNCTION next_rechnungs_nr(TEXT, INTEGER) IS
  'AAR-416: Atomarer Counter-Increment für fortlaufende Rechnungs-Nr. pro (Serie, Jahr).';;
