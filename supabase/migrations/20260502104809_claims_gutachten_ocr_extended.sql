-- Erweiterte OCR-Auslese fuer Gutachten — Cluster A bis E.
--
-- Cluster A: Fahrzeug-Stammdaten (Audit + VS-Anschreiben)
-- Cluster B: Vorschaeden + Zustand
-- Cluster C: Reparatur-Detail (Werkstatt-Briefing)
-- Cluster D: Mietwagen + Nutzungsausfall (Tagessaetze)
-- Cluster E: SV-Metadaten + Kalkulationssystem
--
-- Alle Felder sind nullable — Claude liefert nur was im PDF steht;
-- fehlende Werte bleiben einfach NULL und koennen vom Admin manuell
-- nachgepflegt werden (Edit-Mode in GutachtenOcrCard).

ALTER TABLE public.claims
  -- Cluster A: Fahrzeug
  ADD COLUMN IF NOT EXISTS gutachten_fin                 text,
  ADD COLUMN IF NOT EXISTS gutachten_kennzeichen         text,
  ADD COLUMN IF NOT EXISTS gutachten_erstzulassung       date,
  ADD COLUMN IF NOT EXISTS gutachten_laufleistung_km     integer,
  ADD COLUMN IF NOT EXISTS gutachten_tuv_bis             date,
  ADD COLUMN IF NOT EXISTS gutachten_fahrzeug_typ        text,
  ADD COLUMN IF NOT EXISTS gutachten_farbe               text,
  ADD COLUMN IF NOT EXISTS gutachten_farbcode            text,
  ADD COLUMN IF NOT EXISTS gutachten_kraftstoff          text,
  -- Cluster B: Vorschaeden
  ADD COLUMN IF NOT EXISTS gutachten_vorschaeden_text    text,
  ADD COLUMN IF NOT EXISTS gutachten_lackmesswert_max_my numeric(6, 1),
  ADD COLUMN IF NOT EXISTS gutachten_karosseriezustand   text,
  -- Cluster C: Reparatur
  ADD COLUMN IF NOT EXISTS gutachten_zeit_ak_std         numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_zeit_kar_std        numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_zeit_lack_std       numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_ak_eur     numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_kar_eur    numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_lack_eur   numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_materialkosten_eur  numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lackmaterial_eur    numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_verbringung_eur     numeric(10, 2),
  -- Cluster D: Mietwagen + Nutzungsausfall
  ADD COLUMN IF NOT EXISTS gutachten_mietwagen_klasse              text,
  ADD COLUMN IF NOT EXISTS gutachten_mietwagen_tagessatz_eur       numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_nutzungsausfall_tagessatz_eur numeric(8, 2),
  -- Cluster E: SV-Metadaten
  ADD COLUMN IF NOT EXISTS gutachten_sv_honorar_netto    numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_sv_honorar_brutto   numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_kalkulationssystem  text,
  ADD COLUMN IF NOT EXISTS gutachten_seitenzahl          integer,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_manuell_ueberschrieben boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.claims.gutachten_ocr_manuell_ueberschrieben IS
  'TRUE wenn ein Admin OCR-Werte manuell editiert hat. Ein Re-Run der OCR-'
  'Pipeline UEBERSCHREIBT diese Werte dann nicht — nur Felder mit NULL '
  'werden befuellt. Damit gehen manuelle Korrekturen nicht verloren.';

-- CHECK-Constraints fuer die wenigen Enum-aehnlichen Felder
ALTER TABLE public.claims
  DROP CONSTRAINT IF EXISTS claims_gutachten_karosseriezustand_check;
ALTER TABLE public.claims
  ADD CONSTRAINT claims_gutachten_karosseriezustand_check CHECK (
    gutachten_karosseriezustand IS NULL
    OR gutachten_karosseriezustand IN ('makellos', 'gebrauchsspuren', 'unfallbeschaedigt', 'sonstiges')
  );

ALTER TABLE public.claims
  DROP CONSTRAINT IF EXISTS claims_gutachten_kalkulationssystem_check;
ALTER TABLE public.claims
  ADD CONSTRAINT claims_gutachten_kalkulationssystem_check CHECK (
    gutachten_kalkulationssystem IS NULL
    OR gutachten_kalkulationssystem IN ('audatex', 'dat', 'autoixpert', 'sonstiges')
  );

ALTER TABLE public.claims
  DROP CONSTRAINT IF EXISTS claims_gutachten_kraftstoff_check;
ALTER TABLE public.claims
  ADD CONSTRAINT claims_gutachten_kraftstoff_check CHECK (
    gutachten_kraftstoff IS NULL
    OR gutachten_kraftstoff IN ('benzin', 'diesel', 'hybrid', 'elektro', 'gas', 'sonstiges')
  );
