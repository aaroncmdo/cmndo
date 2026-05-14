-- AAR-319: FAQ-Bot (Kunde) + KB-Assistent teilen die ki_gespraeche-Tabelle.
-- Pro (fall_id, rolle) gibt es EIN fortlaufendes Gespräch mit Messages als
-- jsonb-Array ({role:'user'|'assistant', content, ts}).

CREATE TABLE IF NOT EXISTS public.ki_gespraeche (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id uuid REFERENCES public.faelle(id) ON DELETE CASCADE,
  rolle text NOT NULL CHECK (rolle IN ('kunde', 'kundenbetreuer')),
  user_id uuid REFERENCES auth.users(id),
  nachrichten jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ki_gespraeche_fall_rolle
  ON public.ki_gespraeche(fall_id, rolle);

-- Ein Gespräch pro Fall + Rolle + User (Multi-Turn-Chat wird re-used)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ki_gespraeche_unique
  ON public.ki_gespraeche(fall_id, rolle, user_id);

ALTER TABLE public.ki_gespraeche ENABLE ROW LEVEL SECURITY;

-- Kunde sieht nur sein eigenes Gespräch
DROP POLICY IF EXISTS "ki_gespraeche_kunde_read" ON public.ki_gespraeche;
CREATE POLICY "ki_gespraeche_kunde_read"
ON public.ki_gespraeche FOR SELECT TO authenticated
USING (
  rolle = 'kunde' AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "ki_gespraeche_kunde_insert" ON public.ki_gespraeche;
CREATE POLICY "ki_gespraeche_kunde_insert"
ON public.ki_gespraeche FOR INSERT TO authenticated
WITH CHECK (
  rolle = 'kunde'
  AND user_id = auth.uid()
  AND fall_id IN (SELECT id FROM faelle WHERE kunde_id = auth.uid())
);

DROP POLICY IF EXISTS "ki_gespraeche_kunde_update" ON public.ki_gespraeche;
CREATE POLICY "ki_gespraeche_kunde_update"
ON public.ki_gespraeche FOR UPDATE TO authenticated
USING (rolle = 'kunde' AND user_id = auth.uid())
WITH CHECK (rolle = 'kunde' AND user_id = auth.uid());

-- KB + Admin: Volles CRUD
DROP POLICY IF EXISTS "ki_gespraeche_staff_all" ON public.ki_gespraeche;
CREATE POLICY "ki_gespraeche_staff_all"
ON public.ki_gespraeche FOR ALL TO authenticated
USING (is_staff())
WITH CHECK (is_staff());

COMMENT ON TABLE public.ki_gespraeche IS 'AAR-319: Multi-Turn-Chat für FAQ-Bot (Kunde) + KB-Assistent. Ein Gespräch pro Fall+Rolle+User.';;
