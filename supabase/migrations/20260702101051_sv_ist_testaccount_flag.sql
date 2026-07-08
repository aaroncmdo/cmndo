-- Gutachter-Onboarding-Audit (Befund #6): echtes Test-Account-Flag statt crude
-- firmenname-ILIKE (isTestAccount). Bisher filterten nur Karte + LP-Count Test-SVs
-- (per Regex), Dispatch/MCP NICHT -> ein aktiver Test-SV war auto-buchbar.
-- Neues Flag = eine Wahrheit fuer Dispatch (applyDispatchableFilter), Karte
-- (anon-RLS) + LP-Count (applyMapVisibleFilter).

ALTER TABLE public.sachverstaendige
  ADD COLUMN IF NOT EXISTS ist_testaccount boolean NOT NULL DEFAULT false;

-- Backfill: bekannte interne Test-/Demo-Accounts flaggen. Praedikat = bisherige
-- firmenname-Heuristik + Claimondo-Test-/Smoke-Emails. Gegen Prod verifiziert:
-- trifft genau die 5 internen Accounts, KEINEN echten SV.
UPDATE public.sachverstaendige s
  SET ist_testaccount = true
  FROM public.profiles p
  WHERE p.id = s.profile_id
    AND (
      s.firmenname ~* '\y(test|smoke|demo)\y'
      OR p.email ILIKE '%claimondo.test'
      OR p.email ILIKE 'test-%@%'
      OR p.email ILIKE 'smoke-%@%'
    );

-- Karten-RLS (anon) um das Flag ergaenzen -> Test-Accounts erscheinen nie auf der
-- oeffentlichen Karte (ersetzt die App-seitige firmenname-Regex in ladeAktiveSVs).
ALTER POLICY "sachverstaendige_anon_select_map_ready"
  ON public.sachverstaendige
  USING (
    verifiziert = true
    AND ist_aktiv = true
    AND portal_zugang_freigeschaltet = true
    AND ist_testaccount = false
    AND geloescht_am IS NULL
    AND gesperrt_seit IS NULL
    AND standort_lat IS NOT NULL
    AND standort_lng IS NOT NULL
    AND isochrone_polygon IS NOT NULL
  );
