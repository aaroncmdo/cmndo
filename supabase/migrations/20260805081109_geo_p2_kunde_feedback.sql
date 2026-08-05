-- GEO-P2 SP2: kunde_feedback — Post-Abschluss-NPS-Capture (0-10 + Kommentar).
-- claim_id = SSoT (nicht fall_id); UNIQUE = genau-eine Umfrage je Claim (idempotent).
-- RLS staff-read; Write ausschliesslich service_role (Cron + Token-Action). KEIN anon-Grant
-- (die anon Response-Route schreibt via service_role-Action nach Token-Validierung).

CREATE TABLE public.kunde_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE REFERENCES public.claims(id) ON DELETE CASCADE,
  rating smallint CHECK (rating >= 0 AND rating <= 10),   -- null bis beantwortet
  kommentar text,
  response_token text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  eingeladen_am timestamptz NOT NULL DEFAULT now(),
  beantwortet_am timestamptz,
  abgemeldet_am timestamptz,                               -- Opt-out (DSGVO Art. 21)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kunde_feedback ENABLE ROW LEVEL SECURITY;

-- Staff-Read (fuer spaetere Fall-/Report-Anzeige); Write nur service_role.
CREATE POLICY kunde_feedback_staff_read ON public.kunde_feedback
  FOR SELECT TO authenticated
  USING (public.can_access_claim(claim_id) OR public.is_kanzlei());

-- Explizite Grants (Default-Privileges granten neuen Tabellen nichts). KEIN anon.
GRANT SELECT ON public.kunde_feedback TO authenticated;
GRANT ALL ON public.kunde_feedback TO service_role;
