-- Kanonische SSoT-Definition "kein echter externer Kunde" (Test/Intern).
-- Genutzt von v_funnel_real + kuenftig von Dashboards (WHERE NOT is_test_lead(email)).
CREATE OR REPLACE FUNCTION public.is_test_lead(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
       p_email ILIKE '%@claimondo.test'
    OR p_email ILIKE '%@example.com'
    OR p_email ILIKE '%@claimondo-test.de'
    OR p_email ILIKE 'smoke-%'
    OR p_email ILIKE 'aaron.sprafke+%'
    OR p_email ILIKE '%@claimondo.de',
  false);
$$;
COMMENT ON FUNCTION public.is_test_lead(text) IS
  'SSoT: true wenn die Email KEIN echter externer Kunde ist (Test-Domains, smoke-*, Aaron-Aliase, @claimondo.de intern). Fuer test-daten-bewusste Funnel-/Dispatch-Sichten.';
