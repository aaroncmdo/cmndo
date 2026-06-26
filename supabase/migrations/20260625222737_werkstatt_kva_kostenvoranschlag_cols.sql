ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN kostenvoranschlag_netto numeric,
  ADD COLUMN kostenvoranschlag_brutto numeric;

ALTER TABLE public.leads
  ADD COLUMN kostenvoranschlag_netto numeric,
  ADD COLUMN kostenvoranschlag_brutto numeric;

COMMENT ON COLUMN public.gutachter_finder_anfragen.kostenvoranschlag_brutto IS
  'Werkstatt-Kostenvoranschlag (Schaetzung). NICHT der SV-Gutachten-Wert / claims.schadens_hoehe_netto.';
COMMENT ON COLUMN public.leads.kostenvoranschlag_brutto IS
  'Werkstatt-Kostenvoranschlag (Schaetzung). NICHT der SV-Gutachten-Wert / claims.schadens_hoehe_netto.';
