-- AAR-571 (V5 Foundation) — phase_transitions: Audit-Log für jeden Fall-
-- Phasenwechsel. Voraussetzung für AAR-573 (V7 Manueller Override) und
-- E1-Zeitmess-Analyse.
--
-- Reconstruction from live schema, 2026-04-19 (AAR-600 C2c Drift-Fix):
-- Dieses File fehlte im Repo, war aber remote bereits als Migration
-- 20260419100432 angewendet. Inhalt rekonstruiert via
-- information_schema / pg_constraint / pg_indexes / pg_policies.
--
-- Das aar571_phase_transitions_null_safe_trigger-File (20260419100604) ergänzt
-- die Log-Funktion + Trigger auf faelle.aktuelle_phase.

CREATE TABLE IF NOT EXISTS public.phase_transitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id         uuid NOT NULL REFERENCES public.faelle(id) ON DELETE CASCADE,
  from_phase      text,
  to_phase        text NOT NULL,
  transition_at   timestamptz NOT NULL DEFAULT now(),
  transitioned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_rolle     text,
  trigger_type    text NOT NULL CHECK (trigger_type = ANY (ARRAY['auto', 'manual', 'webhook', 'scheduled'])),
  grund           text,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phase_transitions_fall_id
  ON public.phase_transitions (fall_id, transition_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase_transitions_actor
  ON public.phase_transitions (transitioned_by, transition_at DESC)
  WHERE transitioned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phase_transitions_trigger_type
  ON public.phase_transitions (trigger_type, transition_at DESC);

ALTER TABLE public.phase_transitions ENABLE ROW LEVEL SECURITY;

-- Staff (admin/KB/dispatch) sieht + schreibt alles.
DROP POLICY IF EXISTS phase_transitions_staff_all ON public.phase_transitions;
CREATE POLICY phase_transitions_staff_all ON public.phase_transitions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.rolle = ANY (ARRAY['admin'::user_role, 'kundenbetreuer'::user_role, 'dispatch'::user_role])
    )
  );

-- Andere Rollen sehen nur eigene Fall-Transitions (RLS-Read).
DROP POLICY IF EXISTS phase_transitions_own_fall ON public.phase_transitions;
CREATE POLICY phase_transitions_own_fall ON public.phase_transitions
  FOR SELECT
  USING (
    fall_id IN (
      SELECT f.id FROM public.faelle f
      WHERE f.kunde_id = auth.uid()
         OR f.sv_id IN (SELECT s.id FROM public.sachverstaendige s WHERE s.user_id = auth.uid())
         OR f.makler_id IN (SELECT m.id FROM public.makler m WHERE m.user_id = auth.uid())
    )
  );

-- Service-Rolle darf immer schreiben (Trigger + Helper).
DROP POLICY IF EXISTS phase_transitions_service_insert ON public.phase_transitions;
CREATE POLICY phase_transitions_service_insert ON public.phase_transitions
  FOR INSERT
  WITH CHECK (true);
