-- Werkstatt-Matching SP1: physische Schadenskategorie (Kunde-gesetzt, fuer fachliches Matching).
-- NICHT claims.schadenart (= Versicherungsart haftpflicht/vollkasko). Best-effort (nullable);
-- 'unbekannt' = kein Matching-Filter. Carry-over Lead->Claim in convert-lead-to-claim.ts.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS schadenskategorie text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS schadenskategorie text;
ALTER TABLE public.leads ADD CONSTRAINT leads_schadenskategorie_check
  CHECK (schadenskategorie IS NULL OR schadenskategorie = ANY(ARRAY['karosserie','lackierung','mechanik','glas','smart_repair','unbekannt']));
ALTER TABLE public.claims ADD CONSTRAINT claims_schadenskategorie_check
  CHECK (schadenskategorie IS NULL OR schadenskategorie = ANY(ARRAY['karosserie','lackierung','mechanik','glas','smart_repair','unbekannt']));
