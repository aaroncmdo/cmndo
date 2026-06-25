ALTER TABLE public.claims
  ADD COLUMN kostenvoranschlag_netto numeric,
  ADD COLUMN kostenvoranschlag_brutto numeric;

COMMENT ON COLUMN public.claims.kostenvoranschlag_brutto IS
  'Werkstatt-Kostenvoranschlag (Schaetzung, Snapshot vom Lead). NICHT der SV-Gutachten-Wert / schadens_hoehe_netto.';
