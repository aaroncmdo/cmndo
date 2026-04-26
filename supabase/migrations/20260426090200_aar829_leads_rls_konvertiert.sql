-- AAR-829: RLS-Ergänzungen für Lead-Konversion
-- KB sieht Lead read-only via claim.lead_id (Audit-Trail nach Konversion).
-- Dispatcher-RLS und Admin-RLS kommen vollständig in AAR-831.

-- Kundenbetreuer darf Lead lesen wenn er den zugehörigen Claim betreut
-- (Read-Only — nur SELECT, kein UPDATE nach Konversion)
DO $$
BEGIN
  -- Policy nur anlegen wenn noch nicht vorhanden
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leads'
      AND policyname = 'leads_kb_via_claim_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY leads_kb_via_claim_select ON public.leads
        FOR SELECT USING (
          EXISTS (
            SELECT 1
              FROM public.claims c
              JOIN public.profiles p ON p.id = auth.uid()
             WHERE c.lead_id = leads.id
               AND p.rolle = 'kundenbetreuer'
               AND c.kundenbetreuer_id = auth.uid()
          )
        )
    $pol$;
  END IF;
END $$;

COMMENT ON POLICY leads_kb_via_claim_select ON public.leads IS
  'AAR-829: Kundenbetreuer sieht Lead wenn er den konvertierten Claim betreut (Audit-Trail). Read-Only.';
