-- CMM-32: Strukturierter Lackfarbe-Code fuer Imagin-Render-Mapping.
-- 12 Standard-Farben — der Dispatcher waehlt aus dem Dropdown, das Render-
-- Image im SV-Banner laedt automatisch das richtige Farb-Asset.
-- fahrzeug_farbe (Freitext) bleibt fuer detaillierte Kunden-Angaben wie
-- "Saphirschwarz Metallic" — wir koennen beide nebeneinander pflegen.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lackfarbe_code text
  CHECK (lackfarbe_code IS NULL OR lackfarbe_code IN (
    'schwarz', 'weiss', 'silber', 'grau', 'blau', 'rot',
    'gruen', 'gelb', 'orange', 'braun', 'beige', 'sonstige'
  ));

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS lackfarbe_code text
  CHECK (lackfarbe_code IS NULL OR lackfarbe_code IN (
    'schwarz', 'weiss', 'silber', 'grau', 'blau', 'rot',
    'gruen', 'gelb', 'orange', 'braun', 'beige', 'sonstige'
  ));

COMMENT ON COLUMN public.leads.lackfarbe_code IS
  'CMM-32: Strukturierter Code fuer Imagin-Render-Mapping. Freitext fahrzeug_farbe bleibt fuer Detail-Bezeichnungen.';
COMMENT ON COLUMN public.faelle.lackfarbe_code IS
  'CMM-32: Strukturierter Code fuer Imagin-Render-Mapping (analog leads.lackfarbe_code, vom Lead vererbt).';
