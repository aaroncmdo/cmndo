-- CMM-49 kunde_email-Cutover (a+c): v_claim_full + v_faelle_mit_aktuellem_termin auf pure-entity
-- kunde_email flippen (COALESCE(party.email, c.kunde_email) -> party.email) und claims.kunde_email
-- DROPpen (IRREVERSIBEL). Vorbedingungen erfuellt: #2982/#2984/#2987 + #2997 (Write-Routing-Retire)
-- auf main + prod-deployed (3f556cabf, deploy success); kein Code liest/schreibt claims.kunde_email
-- direkt (Reader via v_claim_full, Writer -> personen.email #2987); named-deps = nur die 2 Views
-- (nach Flip 0); keine RLS; value-neutral ausser 3 synth. Seeds (CLM-2026-00203/00101/00102).
-- personen.email (geschaedigter-Party) ist danach alleinige Kunden-Email-SSoT.

-- step-a View 1: v_claim_full  (kunde_p = geschaedigter-Party -> personen)
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('public.v_claim_full'::regclass, true);
  IF position('COALESCE(kunde_p.email, c.kunde_email)' in d) = 0 THEN
    RAISE EXCEPTION 'v_claim_full: pattern "COALESCE(kunde_p.email, c.kunde_email)" missing - abort';
  END IF;
  d := replace(d, 'COALESCE(kunde_p.email, c.kunde_email)', 'kunde_p.email');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || d;
END $$;

-- step-a View 2: v_faelle_mit_aktuellem_termin  (cp_g = geschaedigter-Party -> personen)
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  IF position('COALESCE(cp_g.email, c.kunde_email)' in d) = 0 THEN
    RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: pattern "COALESCE(cp_g.email, c.kunde_email)" missing - abort';
  END IF;
  d := replace(d, 'COALESCE(cp_g.email, c.kunde_email)', 'cp_g.email');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || d;
END $$;

-- step-c: DROP (irreversibel) — nach step-a referenziert nichts mehr c.kunde_email
ALTER TABLE public.claims DROP COLUMN kunde_email;
