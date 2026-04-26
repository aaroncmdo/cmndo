-- AAR-841 Frontend Phase A: kb_override als dritter erlaubter Wert für
-- claims.kanzlei_wunsch_gefragt_in_phase. Nötig damit der KB-Sidebar-Override
-- (separate Component) im Audit nachvollziehbar ist.

ALTER TABLE public.claims
  DROP CONSTRAINT IF EXISTS claims_kanzlei_gefragt_in_phase_check;

ALTER TABLE public.claims
  ADD CONSTRAINT claims_kanzlei_gefragt_in_phase_check CHECK (
    kanzlei_wunsch_gefragt_in_phase IS NULL
    OR kanzlei_wunsch_gefragt_in_phase = ANY (ARRAY[
      'lead_konvertierung',
      'phase_4_re_frage',
      'kb_override'
    ])
  );
