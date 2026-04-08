-- KFZ-148: SV Onboarding mit Vertragsunterzeichnung + Stripe + Reminder

-- Vertragsvorlagen
CREATE TABLE IF NOT EXISTS vertragsvorlagen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT NOT NULL CHECK (typ IN ('nutzungsbedingungen','kooperationsvertrag_muster','sa_kunde')),
  version TEXT NOT NULL,
  titel TEXT NOT NULL,
  inhalt_html TEXT NOT NULL,
  pflicht_unterschrift BOOLEAN NOT NULL DEFAULT true,
  aktiv BOOLEAN NOT NULL DEFAULT true,
  gueltig_ab TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vertragsvorlagen_typ_aktiv ON vertragsvorlagen(typ, aktiv);

-- Unterzeichnete Vertraege
CREATE TABLE IF NOT EXISTS vertraege_unterzeichnet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gutachter_id UUID NOT NULL REFERENCES sachverstaendige(id) ON DELETE CASCADE,
  vorlage_id UUID NOT NULL REFERENCES vertragsvorlagen(id),
  vorlage_typ TEXT NOT NULL,
  vorlage_version TEXT NOT NULL,
  unterschrift_name TEXT NOT NULL,
  unterschrift_datum TIMESTAMPTZ NOT NULL DEFAULT now(),
  unterschrift_ip TEXT NULL,
  unterschrift_user_agent TEXT NULL,
  pdf_storage_path TEXT NULL,
  email_log_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vertraege_gutachter ON vertraege_unterzeichnet(gutachter_id);

-- Onboarding-Status auf sachverstaendige
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS onboarding_anzahlung_betrag NUMERIC(10,2) NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS onboarding_anzahlung_faellig_am TIMESTAMPTZ NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS stripe_anzahlung_payment_intent_id TEXT NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS stripe_anzahlung_bezahlt_am TIMESTAMPTZ NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS portal_zugang_freigeschaltet BOOLEAN NOT NULL DEFAULT true;
-- Default true fuer Bestandsgutachter! Neue SVs bekommen false vom Admin gesetzt.

-- Stripe Events Audit-Log
CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  gutachter_id UUID NULL REFERENCES sachverstaendige(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  verarbeitet BOOLEAN NOT NULL DEFAULT false,
  fehler TEXT NULL,
  empfangen_am TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stripe_events_typ ON stripe_events(event_type);

-- Payment Reminder Tracking
CREATE TABLE IF NOT EXISTS sv_payment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gutachter_id UUID NOT NULL REFERENCES sachverstaendige(id) ON DELETE CASCADE,
  reminder_typ TEXT NOT NULL CHECK (reminder_typ IN ('email_3d','email_7d','email_14d','admin_task_call_3d','admin_task_call_10d','final_warnung')),
  versendet_am TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_reminders_unique ON sv_payment_reminders(gutachter_id, reminder_typ);

-- Storage Bucket fuer Vertraege
INSERT INTO storage.buckets (id, name, public) VALUES ('vertraege', 'vertraege', false) ON CONFLICT DO NOTHING;
