-- Grundhonorar pro Auftrag.
--
-- Begruendung: der SV soll im Kanzleifall-Lifecycle sehen, was er als
-- Grundhonorar fordert (vs. die Kunden-Forderung gegen die VS, die ein
-- separater Wert ist). Die VS hat noch nicht ausgezahlt — beide Betraege
-- sind also „gefordert", nicht „eingegangen".
--
-- Befuellung: aktuell manuell durch Admin/KB nach QC-Freigabe. Ein
-- spaeterer Schritt kann das aus der Honorartabelle automatisieren.

ALTER TABLE public.auftraege
  ADD COLUMN IF NOT EXISTS grundhonorar_netto numeric(10, 2),
  ADD COLUMN IF NOT EXISTS grundhonorar_brutto numeric(10, 2);

COMMENT ON COLUMN public.auftraege.grundhonorar_netto IS
  'Vom SV gefordertes Grundhonorar netto (vor Lead-Abzug). Sichtbar fuer SV im Kanzleifall-Lifecycle.';
COMMENT ON COLUMN public.auftraege.grundhonorar_brutto IS
  'Vom SV gefordertes Grundhonorar brutto. Sichtbar fuer SV im Kanzleifall-Lifecycle.';
