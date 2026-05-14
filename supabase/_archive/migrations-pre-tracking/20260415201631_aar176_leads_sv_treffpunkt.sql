
-- AAR-176 P2-C: sv_treffpunkt Freitextfeld für den Dispatcher damit der
-- SV vor Ort einen konkreten Treffpunkt-Hinweis bekommt (z. B. „Parkhaus
-- Ebene 3 Stellplatz 42" oder „Einfahrt neben der Apotheke").
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sv_treffpunkt TEXT;
COMMENT ON COLUMN leads.sv_treffpunkt IS
  'AAR-176: Freitext-Hinweis für den SV zum konkreten Treffpunkt (zusätzlich zu unfallort).';
;
