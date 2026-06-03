-- CMM Entity-Model Phase 1a: globale Personen-Registry (Keystone).
-- Eine Zeile pro realer Person; claim_parties wird kuenftig der Person<->Claim-Rolle-Link
-- (person_id). user_id (nullable) = Account-Link + zuverlaessiger Dedup-Key; KEIN Auto-Merge
-- Fremder (Aaron 03.06.). Additiv, (noch) kein Consumer -> zero-risk/zero-collision.
-- FK auf user kommt mit dem Wiring (profiles vs auth.users dann klaeren). RLS gelockt
-- (nur service_role); proper per-Rolle-RLS mit dem Wiring.
CREATE TABLE IF NOT EXISTS public.personen (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid,                          -- Account-Link (nullable) = Dedup-Key
  anrede            text,
  titel             text,
  vorname           text,
  nachname          text,
  firma             text,
  ist_gewerbe       boolean NOT NULL DEFAULT false,
  geburtsdatum      date,
  email             text,
  telefon           text,
  mobil             text,
  adresse_strasse   text,
  adresse_plz       text,
  adresse_ort       text,
  adresse_land      text,
  fuehrerscheinnummer    text,
  fuehrerscheinklassen   text,
  ust_id            text,
  ist_anonymisiert  boolean NOT NULL DEFAULT false,
  anonymisiert_am   timestamptz,
  notiz             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personen_user_id ON public.personen (user_id) WHERE user_id IS NOT NULL;
ALTER TABLE public.personen ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.personen TO service_role;
