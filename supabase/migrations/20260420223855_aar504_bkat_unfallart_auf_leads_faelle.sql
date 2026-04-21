-- AAR-504/505: BKat-Unfallart-Spalte auf leads + faelle.
--
-- Bisher: leads.schadentyp (text, 5 Legacy-Werte) als einzige Quelle der
-- Unfall-Kategorie. Fuer die BKat-Integration brauchen wir eine praezise
-- 15-Werte-Klassifikation, ohne den Legacy-Enum zu brechen.
--
-- Neue Spalte: `bkat_unfallart` (bereits existierender Enum-Typ aus AAR-503).
-- Nullable — nur gefuellt wenn KI-Analyse oder Dispatcher sie explizit setzt.
-- schadentyp (text) bleibt als Legacy-Spalte fuer die alten 5-Kategorien-UIs
-- (SchadentypPicker) bis B3b (Schadentyp-Code-Sweep) folgt.
--
-- WICHTIG: Wir speichern hier NIE TBNRs selbst — nur die abgeleitete
-- Unfallart-Kategorie. TBNR = Tatbestandsnummer (offizielles Polizei-
-- Dokument). Ohne Polizei-Beteiligung koennte eine TBNR-Persistenz bei
-- der Kanzlei Verwirrung stiften. TBNRs bleiben nur transient in der UI
-- oder — bei echtem Polizeibericht-Upload — in fall_dokumente.ocr_result.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS bkat_unfallart bkat_unfallart;

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS bkat_unfallart bkat_unfallart;

COMMENT ON COLUMN public.leads.bkat_unfallart IS
  'AAR-504/505: BKat-konforme Unfallart-Klassifikation (15 Werte). '
  'Gesetzt durch KI-Analyse aus Unfallhergang-Text oder Polizeibericht-OCR, '
  'vom Dispatcher bestaetigt. Legacy-Pendant: leads.schadentyp (text, 5 Werte).';

COMMENT ON COLUMN public.faelle.bkat_unfallart IS
  'AAR-504/505: BKat-konforme Unfallart-Klassifikation (15 Werte). '
  'Wird aus leads.bkat_unfallart beim convertLeadToFall uebernommen.';
