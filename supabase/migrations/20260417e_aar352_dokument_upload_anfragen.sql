-- AAR-352: Multi-Slot-Upload-Anfragen — Dispatcher fordert in einem Rutsch
-- mehrere Dokumente beim Kunden an (ZB1 + Polizeibericht + sonstige).
-- Ersetzt die Einzel-Karten-Logik (zb1_token/polizeibericht_token auf leads
-- bleiben als Legacy-Felder für WhatsApp-Inbound-Webhook-Kompatibilität).

CREATE TABLE IF NOT EXISTS dokument_upload_anfragen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  -- slots: [{slot_id: 'fahrzeugschein', ocr: true, hochgeladen: false, doc_url?: string, hochgeladen_am?: string}, ...]
  slots jsonb NOT NULL,
  kanal text NOT NULL CHECK (kanal IN ('whatsapp','sms','email')),
  status text NOT NULL DEFAULT 'gesendet' CHECK (status IN ('gesendet','teilweise','komplett','abgelaufen')),
  gesendet_am timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  erstellt_von uuid REFERENCES profiles(id) ON DELETE SET NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dokument_upload_anfragen_token ON dokument_upload_anfragen (token);
CREATE INDEX IF NOT EXISTS idx_dokument_upload_anfragen_lead ON dokument_upload_anfragen (lead_id, gesendet_am DESC);

COMMENT ON TABLE dokument_upload_anfragen IS 'AAR-352: Multi-Slot-Upload-Anfragen (ZB1 + Polizeibericht + sonstige in einem Link).';
COMMENT ON COLUMN dokument_upload_anfragen.slots IS 'JSONB-Array: [{slot_id, ocr?, hochgeladen, doc_url?, hochgeladen_am?}]';

-- RLS: Service-Role + Dispatch/Admin/KB lesen, Public liest via token-Lookup (in Server-Action)
ALTER TABLE dokument_upload_anfragen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dua_service_all ON dokument_upload_anfragen;
CREATE POLICY dua_service_all ON dokument_upload_anfragen
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS dua_staff_read ON dokument_upload_anfragen;
CREATE POLICY dua_staff_read ON dokument_upload_anfragen
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.rolle IN ('admin','dispatch','kundenbetreuer','leadbearbeiter')
    )
  );
