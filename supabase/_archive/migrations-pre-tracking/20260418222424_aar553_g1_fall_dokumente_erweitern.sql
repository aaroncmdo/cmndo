ALTER TABLE fall_dokumente
  ADD COLUMN IF NOT EXISTS kategorie text,
  ADD COLUMN IF NOT EXISTS quelle text,
  ADD COLUMN IF NOT EXISTS sichtbar_fuer text[] DEFAULT ARRAY['admin','kundenbetreuer']::text[],
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES schadenspositionen(id) ON DELETE SET NULL;

COMMENT ON COLUMN fall_dokumente.kategorie IS
  'UI-Kategorie (unterschrift, foto, zulassungsbescheinigung, gutachten, sonstiges). Treibt Farbcodierung und Filter in DokumenteTab. AAR-553 G1.';

COMMENT ON COLUMN fall_dokumente.quelle IS
  'Herkunfts-Trail: flowlink, whatsapp, email, gutachter-portal, admin-upload, seed. Für Audit und Debugging. AAR-553 G1.';

COMMENT ON COLUMN fall_dokumente.sichtbar_fuer IS
  'ACL-Array: welche Rollen dürfen das Dokument sehen. Default admin+kundenbetreuer. Werte aus profiles.rolle. AAR-553 G1.';

COMMENT ON COLUMN fall_dokumente.position_id IS
  'FK auf schadenspositionen, wenn Dokument (Foto) an eine konkrete Schaden-Position gebunden ist. Optional. AAR-553 G1.';;
