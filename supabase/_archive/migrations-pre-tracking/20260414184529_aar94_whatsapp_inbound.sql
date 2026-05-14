CREATE TABLE IF NOT EXISTS whatsapp_inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_message_sid TEXT UNIQUE NOT NULL,
  from_phone TEXT NOT NULL,
  to_phone TEXT NOT NULL,
  body TEXT,
  media_urls JSONB,
  num_media INT DEFAULT 0,
  matched_lead_id UUID REFERENCES leads(id),
  matched_fall_id UUID REFERENCES faelle(id),
  matched_termin_id UUID REFERENCES gutachter_termine(id),
  intent TEXT,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_inbound_phone ON whatsapp_inbound_messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_wa_inbound_processed ON whatsapp_inbound_messages(processed);
CREATE INDEX IF NOT EXISTS idx_wa_inbound_fall ON whatsapp_inbound_messages(matched_fall_id);

ALTER TABLE whatsapp_inbound_messages DISABLE ROW LEVEL SECURITY;;
