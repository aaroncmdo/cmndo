-- KFZ-141: Monats-Abrechnungs-Versand (Marketing + Kanzlei)
-- Zentrale Abrechnungen-Tabelle + Storage Bucket fuer PDFs

CREATE TABLE IF NOT EXISTS abrechnungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empfaenger_typ TEXT NOT NULL CHECK (empfaenger_typ IN ('marketing','kanzlei','sv')),
  empfaenger_id UUID NULL,
  empfaenger_email TEXT NOT NULL,
  empfaenger_name TEXT NOT NULL,
  abrechnungs_nr TEXT UNIQUE NOT NULL,
  abrechnungs_zeitraum_start DATE NOT NULL,
  abrechnungs_zeitraum_ende DATE NOT NULL,
  positionen JSONB NOT NULL,
  summe_netto NUMERIC(10,2) NOT NULL,
  ust_satz NUMERIC(4,2) NOT NULL DEFAULT 19.00,
  ust_betrag NUMERIC(10,2) NOT NULL,
  summe_brutto NUMERIC(10,2) NOT NULL,
  versand_datum TIMESTAMPTZ NULL,
  faellig_am DATE NULL,
  status TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','versendet','bezahlt','ueberfaellig','storniert')),
  bezahlt_am TIMESTAMPTZ NULL,
  bezahlt_betrag NUMERIC(10,2) NULL,
  pdf_path TEXT NULL,
  email_log_id UUID NULL,
  notiz TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abrechnungen_status ON abrechnungen(status);
CREATE INDEX IF NOT EXISTS idx_abrechnungen_faellig ON abrechnungen(faellig_am) WHERE status IN ('versendet','ueberfaellig');
CREATE INDEX IF NOT EXISTS idx_abrechnungen_empfaenger ON abrechnungen(empfaenger_typ, empfaenger_id);

-- RLS
ALTER TABLE abrechnungen ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "abrechnungen_auth" ON abrechnungen
    FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Storage Bucket fuer Abrechnungs-PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('abrechnungen-pdf', 'abrechnungen-pdf', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- RLS fuer Storage: nur Admin + Service-Role
DO $$ BEGIN
  CREATE POLICY "abrechnungen_pdf_admin_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'abrechnungen-pdf' AND auth.role() IN ('authenticated', 'service_role'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "abrechnungen_pdf_service_write" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'abrechnungen-pdf' AND auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
