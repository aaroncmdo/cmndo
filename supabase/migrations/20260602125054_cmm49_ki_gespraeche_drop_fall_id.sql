-- CMM-49 Drop-Runway P3 (Pilot / FK-ai-dead): ki_gespraeche von faelle entkoppeln.
-- 0 Rows, 0 Live-Code-Refs (nur Kommentare + generierte Typen). claim_id bereits da
-- (cmm49_rekey_batch_b). Vollstaendiges FK-Cutover-Muster (KEY-Finding: fall_id hat
-- Dependents -> RLS-Policy + derive-Trigger MUESSEN vor dem Column-Drop weichen):
--   1) kunde_insert-Policy von fall_id-Scope auf claim_id (is_claim_user_party,
--      kanonischer Kunde-Claim-Check; staff-Policy war bereits claim-based via
--      can_access_claim). kunde_id != geschaedigter_user_id bei 1 Fall -> kanonischen
--      Helper statt Inline-Spalte nutzen.
--   2) derive_claim_id_from_fall-Trigger (BEFORE INS/UPD OF fall_id) auf DIESER Tabelle
--      droppen (Funktion bleibt — von 42 Triggern geteilt). claim_id kuenftig direkt.
--   3) fall_id-Spalte droppen (inkl. FK ki_gespraeche_fall_id_fkey).
DROP POLICY IF EXISTS ki_gespraeche_kunde_insert ON public.ki_gespraeche;
CREATE POLICY ki_gespraeche_kunde_insert ON public.ki_gespraeche
  FOR INSERT TO authenticated
  WITH CHECK (
    rolle = 'kunde'::text
    AND user_id = (SELECT auth.uid())
    AND claim_id IS NOT NULL
    AND is_claim_user_party(claim_id)
  );

-- Replay-Safety (KEY-Finding): die staff-Policy ist auf LIVE bereits claim_id-basiert
-- (frueher via untracked DDL repointet), haengt aber im Fresh-Replay (db reset /
-- Supabase Preview) noch an fall_id -> nackter DROP COLUMN scheitert dort mit 2BP01.
-- Darum hier idempotent auf claim_id setzen (Definition == live). Auf live ein No-op
-- (Migration ist getrackt, wird nicht re-applied); auf Replay raeumt es die letzte
-- fall_id-Dependency weg, bevor die Spalte faellt. LEHRE: nicht die Live-Dependents
-- pruefen, sondern den Replay (Supabase Preview ist das echte Gate, nicht apply_migration).
DROP POLICY IF EXISTS ki_gespraeche_staff_fall_scoped ON public.ki_gespraeche;
CREATE POLICY ki_gespraeche_staff_fall_scoped ON public.ki_gespraeche
  FOR ALL TO authenticated
  USING (
    (claim_id IS NOT NULL AND can_access_claim(claim_id))
    OR (claim_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])
    ))
  )
  WITH CHECK (
    (claim_id IS NOT NULL AND can_access_claim(claim_id))
    OR (claim_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])
    ))
  );

DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.ki_gespraeche;

ALTER TABLE public.ki_gespraeche DROP COLUMN fall_id;
