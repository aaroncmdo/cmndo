-- AAR-305: Schadensfotos aus dem Onboarding werden erst auf leads.schadensfoto_urls
-- zwischengespeichert (Fall existiert noch nicht beim Flow-Step). Bei
-- signSAandCreateFall werden die URLs in dokumente (fall-bound) übertragen.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS schadensfoto_urls jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.leads.schadensfoto_urls IS 'AAR-305: Array von Public-URLs der vom Kunden im Onboarding hochgeladenen Schadensfotos. Werden bei Fall-Anlage in dokumente (fall-bound) übertragen.';;
