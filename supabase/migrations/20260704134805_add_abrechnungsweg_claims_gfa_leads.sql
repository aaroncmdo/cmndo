-- SP-A Fundament (Werkstatt-Finder-Anfrage): abrechnungsweg auf claims (SSoT),
-- gutachter_finder_anfragen (Qualifikation) und leads (carry-over).
-- Additiv, nullable, CHECK auf die 3 Wege. Bricht keine bestehenden Reads/Writes
-- (Bestandszeilen bleiben NULL). Plugin-getrackte Version == Dateiname (Regel 2).
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS abrechnungsweg text
  CHECK (abrechnungsweg IS NULL OR abrechnungsweg IN ('haftpflicht','kasko','selbstzahler'));
ALTER TABLE public.gutachter_finder_anfragen ADD COLUMN IF NOT EXISTS abrechnungsweg text
  CHECK (abrechnungsweg IS NULL OR abrechnungsweg IN ('haftpflicht','kasko','selbstzahler'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS abrechnungsweg text
  CHECK (abrechnungsweg IS NULL OR abrechnungsweg IN ('haftpflicht','kasko','selbstzahler'));
