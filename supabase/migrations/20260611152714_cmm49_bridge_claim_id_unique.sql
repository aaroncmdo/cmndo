-- CMM-49 (fb34de27): UNIQUE-Guardrail auf faelle_claim_bridge.claim_id.
-- Die Bridge ist de-facto 1:1 (claim_id distinct=79, dup=0, null=0), aber bisher nur
-- PRIMARY KEY auf fall_id — claim_id war unconstrained. Der kommende claims->bridge-Trigger
-- (Step 4) + jeder noch nicht auf Identity umgestellte faelle-Insert-Pfad (convert-lead UND
-- admin/faelle/anlegen via createClaimForFall) koennten sonst LAUTLOS 2 Bridge-Rows je
-- claim_id erzeugen: faelle->bridge schreibt (F,C), claims->bridge (C,C), F != C, nur
-- ON CONFLICT(fall_id) -> kein Dedup auf claim_id. Diese UNIQUE macht genau diese Fan-out-
-- Klasse zu einem LAUTEN Error statt stiller 1:1-Korruption (NO-CASCADE-Sicherheitsnetz-Geist).
-- Value-neutral: validiert sofort, dup_claim_id=0 unmittelbar vor Apply verifiziert.
-- Caveat: eine (praktisch nie vorkommende) faelle.claim_id-Reassignment wuerde dann erroren.
-- Bereits via apply_migration appliziert (recorded version 20260611152714); File = Regel-2-Tracking.
ALTER TABLE public.faelle_claim_bridge
  ADD CONSTRAINT faelle_claim_bridge_claim_id_key UNIQUE (claim_id);
