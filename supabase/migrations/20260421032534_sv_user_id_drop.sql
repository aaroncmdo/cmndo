-- AAR SV-Audit-Follow-up: sachverstaendige.user_id Column-Drop.
--
-- Begründung: Legacy-Feld aus Pre-AAR-185. Alle Queries filtern heute auf
-- profile_id (oder ein OR beider — was in Audit als inkonsistent gefunden
-- wurde wenn 1 von 8 SVs user_id=NULL hat). Alle Consumer sind im
-- begleitenden TS-Commit auf profile_id-only umgestellt.
--
-- Reihenfolge:
--   1. Backfill defensiv: wo user_id gesetzt und profile_id NULL ist,
--      profile_id füllen. In der aktuellen DB (Stand 2026-04-21) ist das
--      für 0 Rows relevant — profile_id ist überall gesetzt, user_id bei
--      1 Row NULL. Der Backfill ist defensiv für den Fall dass sich das
--      zwischen Audit und Migration ändert.
--   2. RLS-Policy sv_update_own umschreiben: (profile_id = auth.uid())
--   3. FK + Column droppen

-- 1. Defensive Backfill (im Moment kein Effekt)
UPDATE public.sachverstaendige
SET profile_id = user_id
WHERE profile_id IS NULL AND user_id IS NOT NULL;

-- 2. RLS-Policy neu: nur profile_id
-- Bestehende Policy droppen, dann neu anlegen (Supabase CLI kennt kein
-- CREATE OR REPLACE POLICY).
DROP POLICY IF EXISTS "sv_update_own" ON public.sachverstaendige;

CREATE POLICY "sv_update_own"
  ON public.sachverstaendige
  FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- 3. Fünf abhängige Policies auf `user_id` umstellen auf `profile_id`.
--    Dropping der Spalte scheitert sonst mit „cannot drop column user_id ...
--    because other objects depend on it".

-- 3a. paket_upgrades „SV eigene Upgrades" — OR-Clause vereinfachen
DROP POLICY IF EXISTS "SV eigene Upgrades" ON public.paket_upgrades;
CREATE POLICY "SV eigene Upgrades"
  ON public.paket_upgrades
  FOR ALL
  TO authenticated
  USING (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.rolle = 'admin'::user_role
    )
  );

-- 3b. storage.objects gutachter_logos_insert/update/delete — alle drei
--     nutzen denselben Subquery auf sachverstaendige.user_id.
DROP POLICY IF EXISTS "gutachter_logos_insert" ON storage.objects;
CREATE POLICY "gutachter_logos_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'gutachter-logos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.sachverstaendige WHERE profile_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] = 'org'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.organisationen WHERE hauptansprechpartner_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "gutachter_logos_update" ON storage.objects;
CREATE POLICY "gutachter_logos_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'gutachter-logos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.sachverstaendige WHERE profile_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] = 'org'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.organisationen WHERE hauptansprechpartner_user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'gutachter-logos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.sachverstaendige WHERE profile_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] = 'org'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.organisationen WHERE hauptansprechpartner_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "gutachter_logos_delete" ON storage.objects;
CREATE POLICY "gutachter_logos_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'gutachter-logos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.sachverstaendige WHERE profile_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] = 'org'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.organisationen WHERE hauptansprechpartner_user_id = auth.uid()
        )
      )
    )
  );

-- 3c. phase_transitions_own_fall — sv-Zweig auf profile_id
DROP POLICY IF EXISTS "phase_transitions_own_fall" ON public.phase_transitions;
CREATE POLICY "phase_transitions_own_fall"
  ON public.phase_transitions
  FOR SELECT
  TO authenticated
  USING (
    fall_id IN (
      SELECT f.id FROM public.faelle f
      WHERE f.kunde_id = auth.uid()
        OR f.sv_id IN (
          SELECT s.id FROM public.sachverstaendige s WHERE s.profile_id = auth.uid()
        )
        OR f.makler_id IN (
          SELECT m.id FROM public.makler m WHERE m.user_id = auth.uid()
        )
    )
  );

-- 4. FK droppen (falls vorhanden), dann Column
ALTER TABLE public.sachverstaendige
  DROP CONSTRAINT IF EXISTS sachverstaendige_user_id_fkey;

ALTER TABLE public.sachverstaendige
  DROP COLUMN IF EXISTS user_id;

COMMENT ON COLUMN public.sachverstaendige.profile_id IS
  'Die einzige FK zu auth.users / profiles. Früher gab es eine parallele '
  'user_id-Spalte (Legacy aus Pre-AAR-185) — diese wurde konsolidiert. '
  'Alle Gutachter-Lookups nutzen getGutachterForUser() in src/lib/gutachter.ts '
  'mit .eq(profile_id, userId).';
