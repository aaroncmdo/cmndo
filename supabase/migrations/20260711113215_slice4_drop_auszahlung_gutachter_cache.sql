-- Slice-4: SV-Auszahlungs-Cache retired -> Ledger (claim_payments, partei 'sv'). v_claim_base liest
-- jetzt p.sv_ist/p.sv_am (Migration slice4_vclaimbase_null_cache_refs). Reader-Prep deployt: #4057
-- (subphase-resolver -> ledger) + #4094 (money-integrity Check-3 entfernt). Writer ledger-geroutet:
-- stammdaten auszahlungLedger-Intercept + lexdrive svAmPeel (delete fuClaims + upsertClaimPayment 'sv').
-- 0 prod-Daten, 0 View-/Index-/Constraint-Dependency (pg_depend leer nach dem View-Rewrite).
ALTER TABLE public.claims
  DROP COLUMN auszahlung_gutachter_betrag,
  DROP COLUMN auszahlung_gutachter_eingegangen_am;
