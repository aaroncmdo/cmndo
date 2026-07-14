-- Global-Suche Slice 1, Task 1: pg_trgm-Extension + Trigram-GIN-Indizes
-- fuer search_global (SECURITY INVOKER RPC, Task 2). Applied via Supabase-Plugin
-- (Regel 2), recorded version = Dateiname.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_trgm_claims_claim_nummer   ON public.claims   USING gin (claim_nummer gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_claims_schadenort_ort ON public.claims   USING gin (schadenort_ort gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_claims_polizei_az     ON public.claims   USING gin (polizei_aktenzeichen gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_vehicles_kennzeichen  ON public.vehicles USING gin (kennzeichen_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_leads_vorname         ON public.leads    USING gin (vorname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_leads_nachname        ON public.leads    USING gin (nachname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_leads_kennzeichen     ON public.leads    USING gin (kennzeichen gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_leads_lead_nummer     ON public.leads    USING gin (lead_nummer gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_personen_vorname      ON public.personen USING gin (vorname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_personen_nachname     ON public.personen USING gin (nachname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_personen_firma        ON public.personen USING gin (firma gin_trgm_ops);
