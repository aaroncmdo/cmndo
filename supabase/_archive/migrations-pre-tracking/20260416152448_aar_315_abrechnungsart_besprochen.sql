-- AAR-315: SV erfasst nach dem Termin was er mit dem Kunden zur Abrechnungsart
-- besprochen hat (fiktiv = nur Schadenhöhe, konkret = mit Reparatur).
-- Dispatch fragt es bewusst NICHT ab — verschreckt Kunden die anfangen zu
-- recherchieren. Erdem erklärt es erst vor Ort.
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS abrechnungsart_besprochen text,
  ADD COLUMN IF NOT EXISTS abrechnungsart_notiz text,
  ADD COLUMN IF NOT EXISTS abrechnungsart_besprochen_am timestamptz;

ALTER TABLE faelle
  DROP CONSTRAINT IF EXISTS faelle_abrechnungsart_besprochen_check;
ALTER TABLE faelle
  ADD CONSTRAINT faelle_abrechnungsart_besprochen_check
  CHECK (abrechnungsart_besprochen IS NULL OR abrechnungsart_besprochen IN ('fiktiv','konkret','noch-offen'));

COMMENT ON COLUMN faelle.abrechnungsart_besprochen IS 'AAR-315: Was der SV nach Besichtigung mit dem Kunden zur Abrechnungsart besprochen hat. fiktiv|konkret|noch-offen.';
COMMENT ON COLUMN faelle.abrechnungsart_notiz IS 'AAR-315: Freitext-Notiz vom SV (z.B. „Kunde will erst nachdenken, ruft zurück").';;
