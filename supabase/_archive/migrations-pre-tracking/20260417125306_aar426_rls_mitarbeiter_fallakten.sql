-- AAR-426: RLS-Hardening — Mitarbeiter sehen nur zugewiesene Fallakten
DROP POLICY IF EXISTS "Mitarbeiter faelle" ON public.faelle;

CREATE POLICY "KB sieht nur zugewiesene Faelle" ON public.faelle
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle = 'kundenbetreuer'
    )
    AND kundenbetreuer_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle = 'kundenbetreuer'
    )
    AND kundenbetreuer_id = auth.uid()
  );

CREATE POLICY "LB sieht eigene und unzugewiesene Faelle" ON public.faelle
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle = 'leadbearbeiter'
    )
    AND (
      leadbearbeiter_id = auth.uid()
      OR leadbearbeiter_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle = 'leadbearbeiter'
    )
    AND (
      leadbearbeiter_id = auth.uid()
      OR leadbearbeiter_id IS NULL
    )
  );

CREATE POLICY "Dispatch full access faelle" ON public.faelle
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle = 'dispatch'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle = 'dispatch'
    )
  );

COMMENT ON POLICY "KB sieht nur zugewiesene Faelle" ON public.faelle IS
  'AAR-426: DSGVO — Kundenbetreuer sehen ausschliesslich Faelle mit kundenbetreuer_id = auth.uid().';
COMMENT ON POLICY "LB sieht eigene und unzugewiesene Faelle" ON public.faelle IS
  'AAR-426: Leadbearbeiter-Inbox — eigene + unzugewiesene (NULL) sichtbar, damit frische Leads geschnappt werden koennen.';
COMMENT ON POLICY "Dispatch full access faelle" ON public.faelle IS
  'AAR-426: Dispatch verteilt Leads, braucht Gesamtsicht ueber alle Faelle.';
;
