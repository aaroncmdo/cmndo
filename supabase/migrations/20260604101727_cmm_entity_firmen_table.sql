-- CMM Entity (b1): globale Firmen-/Gewerbe-Entitaet. Natuerliche Personen -> personen, Firmen -> hier.
-- Aaron 04.06.: eine Firma kann GLEICHZEITIG interne Organisation (SV-Buero/Partner) UND
-- Schaediger/Geschaedigter sein -> organisation_id verknuepft mit der internen organisationen-Tabelle
-- (nullable) = eine genormte Firmen-Entitaet, minimale Dupes. Dedup: UStID (hart) + name+plz (weich).
CREATE TABLE public.firmen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rechtsform text,
  ust_id text,
  steuernummer text,
  handelsregister text,
  adresse_strasse text,
  adresse_plz text,
  adresse_ort text,
  adresse_land text DEFAULT 'DE',
  telefon text,
  email text,
  webseite text,
  organisation_id uuid REFERENCES public.organisationen(id) ON DELETE SET NULL,
  ist_anonymisiert boolean NOT NULL DEFAULT false,
  anonymisiert_am timestamptz,
  notiz text,
  quelle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.firmen IS 'CMM Entity: globale Firmen-/Gewerbe-Entitaet (Schaediger/Geschaedigter-Firmen, claim-uebergreifend reusable). Natuerliche Personen -> personen, Firmen -> hier. organisation_id verknuepft mit der internen organisationen-Tabelle wenn dieselbe Firma auch interne Org ist (SV-Buero/Partner) -> minimale Dupes.';
COMMENT ON COLUMN public.firmen.organisation_id IS 'Link zur internen organisationen-Tabelle (nullable): dieselbe Firma kann interne Org UND Claim-Partei sein.';

CREATE UNIQUE INDEX firmen_ust_id_uniq ON public.firmen (ust_id) WHERE ust_id IS NOT NULL;
CREATE INDEX firmen_organisation_id_idx ON public.firmen (organisation_id);
CREATE INDEX firmen_name_plz_idx ON public.firmen (lower(name), adresse_plz);

-- RLS: PII-nahe Entitaet wie personen -> RLS an, KEINE Client-Policies (deny-all to authenticated;
-- Zugriff via Definer-Views + service_role). Strenger als personen: anon explizit revoked.
ALTER TABLE public.firmen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firmen FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.firmen TO authenticated;
