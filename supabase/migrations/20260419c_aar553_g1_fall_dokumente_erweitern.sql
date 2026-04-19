-- AAR-553 G1: fall_dokumente um 4 Felder aus dokumente erweitern.
--
-- Hintergrund:
--   fall_dokumente (6 Rows in Prod, aktiv genutzt) hat modernere Schema
--   (OCR, idempotency_key, discrepancy_flag, uploaded_by_sv/_kunde), aber
--   fehlt 4 ACL-/Kategorisierungs-Felder, die bisher nur in dokumente
--   (0 Rows in Prod, Legacy-Writer) vorhanden sind:
--
--     kategorie           — UI-Farbcodierung + Filter (unterschrift, foto, ...)
--     quelle              — Herkunfts-Trail (flowlink, whatsapp, gutachter, ...)
--     sichtbar_fuer       — ACL Array (admin/kundenbetreuer/kanzlei/sv/kunde)
--     position_id         — FK auf schadenspositionen (Foto ↔ Schaden)
--
-- Schritt G2 (separater Commit) zieht dann die 14 Writer + 7 Reader von
-- dokumente auf fall_dokumente um, Schritt G3 droppt dokumente final.
-- Diese Migration ist additiv + rückwärtskompatibel: kein Reader bricht,
-- kein Writer bricht.

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
  'FK auf schadenspositionen, wenn Dokument (Foto) an eine konkrete Schaden-Position gebunden ist. Optional. AAR-553 G1.';
