-- CMM Entity-Model Phase 1b: Mietwagenunternehmen als eigene Entitaet (wie werkstaetten).
-- claim_mietwagen.anbieter (TEXT) wird kuenftig FK hierauf. Additiv, kein Consumer.
CREATE TABLE IF NOT EXISTS public.mietwagenunternehmen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  adresse_strasse  text,
  adresse_plz      text,
  adresse_ort      text,
  telefon          text,
  email            text,
  website          text,
  partner          boolean NOT NULL DEFAULT false,
  lat              double precision,
  lng              double precision,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mietwagenunternehmen ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.mietwagenunternehmen TO service_role;
