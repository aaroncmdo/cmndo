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

-- Replay-Safety: can_access_claim wurde auf LIVE via UNTRACKED DDL erstellt (in KEINER
-- Migration) -> fehlt im Fresh-Replay -> die staff-Policy-Recreation unten (nutzt
-- can_access_claim) brach mit 42883 (function does not exist). Hier die Live-Definition
-- tracked nachziehen. CREATE OR REPLACE = No-op auf live (Funktion existiert, Migration ist
-- getrackt + wird nicht re-applied); ab hier ist can_access_claim auch im Replay verfuegbar
-- (fuer alle spaeteren FK-Drops). Nutzt nur Baseline-Objekte (profiles/claims/user_role).
CREATE OR REPLACE FUNCTION public.can_access_claim(p_claim_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $can_access_claim$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin'::user_role, 'dispatch'::user_role))
    OR
    EXISTS (SELECT 1 FROM claims c JOIN profiles p ON p.id = auth.uid()
            WHERE c.id = p_claim_id AND p.rolle = 'kundenbetreuer'::user_role AND c.kundenbetreuer_id = auth.uid());
$can_access_claim$;
GRANT EXECUTE ON FUNCTION public.can_access_claim(uuid) TO authenticated;

-- Replay-Safety-HOTFIX (nachgereicht in #2270): die staff-Policy ist auf LIVE bereits
-- claim_id-basiert (frueher via untracked DDL repointet), haengt aber im Fresh-Replay
-- (db reset / Supabase Preview) noch an fall_id -> nackter DROP COLUMN scheitert dort mit
-- 2BP01. #2261 wurde mit der urspruenglichen (replay-broken) Fassung gemergt, BEVOR dieser
-- Fix landete -> staging-Replay war kaputt. Hier idempotent auf claim_id (Definition == live).
-- Auf live No-op (Migration getrackt, nicht re-applied); auf Replay raeumt es die letzte
-- fall_id-Dependency. LEHRE (Plan §5): Supabase Preview ist das Gate, nicht apply_migration.
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
