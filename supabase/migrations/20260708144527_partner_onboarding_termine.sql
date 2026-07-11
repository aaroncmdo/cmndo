-- (3) Partner-Onboarding-Termine: additive Spalten + typ/kanal-Checks auf admin_termine.
ALTER TABLE public.admin_termine
  ADD COLUMN IF NOT EXISTS partner_lead_id uuid REFERENCES public.partner_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kanal text,
  ADD COLUMN IF NOT EXISTS video_link text,
  ADD COLUMN IF NOT EXISTS treffpunkt_adresse text,
  ADD COLUMN IF NOT EXISTS treffpunkt_lat double precision,
  ADD COLUMN IF NOT EXISTS treffpunkt_lng double precision;

-- typ-Check um 'partner_onboarding' erweitern (Bestand ['rueckruf','kunde','intern'] bleibt gueltig).
ALTER TABLE public.admin_termine DROP CONSTRAINT IF EXISTS admin_termine_typ_check;
ALTER TABLE public.admin_termine ADD CONSTRAINT admin_termine_typ_check
  CHECK (typ = ANY (ARRAY['rueckruf'::text, 'kunde'::text, 'intern'::text, 'partner_onboarding'::text]));

-- kanal-Domain (nur online/vor_ort; NULL fuer Nicht-Onboarding-Termine).
ALTER TABLE public.admin_termine DROP CONSTRAINT IF EXISTS admin_termine_kanal_check;
ALTER TABLE public.admin_termine ADD CONSTRAINT admin_termine_kanal_check
  CHECK (kanal IS NULL OR kanal = ANY (ARRAY['online'::text, 'vor_ort'::text]));

-- Index fuer den Loader (.in('partner_lead_id', leadIds)).
CREATE INDEX IF NOT EXISTS idx_admin_termine_partner_lead_id
  ON public.admin_termine (partner_lead_id) WHERE partner_lead_id IS NOT NULL;
