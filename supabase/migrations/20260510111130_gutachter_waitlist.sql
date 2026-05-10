-- AAR: Gutachter-Waitlist für gutachter.claimondo.de B2B-Landing.
-- Eingehende Bewerbungen landen hier (vor Onboarding-Wizard). Admin
-- triagt sie über /admin/partner/waitlist und entscheidet ob daraus ein
-- vollwertiger SV-Onboarding-Flow wird.

CREATE TABLE IF NOT EXISTS gutachter_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kontakt
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  email TEXT NOT NULL,
  telefon TEXT,

  -- Standort + Gebiet (für Live-Karte-Anchor)
  plz TEXT NOT NULL,
  ort TEXT,
  standort_lat NUMERIC(10, 7),
  standort_lng NUMERIC(10, 7),

  -- Qualifikation
  dat_expert_nummer TEXT,
  bvsk_mitgliedsnummer TEXT,
  ihk_zertifikat_nummer TEXT,
  oebuv_bestellungsnummer TEXT,

  -- Geschäftsdaten
  unternehmen TEXT,
  jahre_erfahrung INTEGER,
  aktuelle_auftraege_pro_monat INTEGER,
  schwerpunkte TEXT,

  -- Lead-Management
  status TEXT NOT NULL DEFAULT 'neu' CHECK (status IN (
    'neu',
    'kontaktiert',
    'qualifiziert',
    'onboarding',
    'aktiv',
    'abgelehnt',
    'kein_interesse'
  )),
  notizen_admin TEXT,
  konvertiert_zu_sv_id UUID REFERENCES sachverstaendige(id) ON DELETE SET NULL,

  -- Tracking
  quelle TEXT,
  user_agent TEXT,
  ip_hash TEXT,

  -- Audit
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  zuletzt_geaendert_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  bearbeitet_von_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT gutachter_waitlist_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT gutachter_waitlist_plz_format CHECK (plz ~ '^[0-9]{5}$')
);

CREATE INDEX idx_gutachter_waitlist_status ON gutachter_waitlist (status);
CREATE INDEX idx_gutachter_waitlist_erstellt_am ON gutachter_waitlist (erstellt_am DESC);
CREATE INDEX idx_gutachter_waitlist_plz ON gutachter_waitlist (plz);

-- Auto-Update zuletzt_geaendert_am
CREATE OR REPLACE FUNCTION gutachter_waitlist_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.zuletzt_geaendert_am = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gutachter_waitlist_touch
  BEFORE UPDATE ON gutachter_waitlist
  FOR EACH ROW
  EXECUTE FUNCTION gutachter_waitlist_touch_updated_at();

-- RLS: nur Admins lesen/schreiben. Public-INSERT läuft NUR via Server-Action
-- mit Admin-Client (Service-Role) — nie direkt vom Browser.
ALTER TABLE gutachter_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_gutachter_waitlist"
  ON gutachter_waitlist
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.rolle = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.rolle = 'admin'
    )
  );

COMMENT ON TABLE gutachter_waitlist IS
  'Bewerbungen von Sachverständigen über gutachter.claimondo.de. Vor-Onboarding-Stufe — wird vom Admin triagt und in sachverstaendige konvertiert wenn passend.';
