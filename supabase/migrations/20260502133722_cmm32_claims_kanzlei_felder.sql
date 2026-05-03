-- CMM-32: Fehlende Kanzlei-Felder auf claims-Tabelle
-- kanzlei_uebergeben_am, kanzlei_ansprechpartner_* wurden bisher nur auf
-- faelle gesetzt. setKanzleiWunsch + versendeKanzleiPaketAnEigeneKanzlei
-- lesen/schreiben diese Felder auf claims — ohne die Spalten schlug die
-- SELECT-Query fehl und gab "Claim nicht gefunden" zurück.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS kanzlei_uebergeben_am           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kanzlei_ansprechpartner_name    TEXT,
  ADD COLUMN IF NOT EXISTS kanzlei_ansprechpartner_email   TEXT,
  ADD COLUMN IF NOT EXISTS kanzlei_ansprechpartner_telefon TEXT;
