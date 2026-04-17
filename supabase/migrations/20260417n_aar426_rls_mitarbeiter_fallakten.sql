-- AAR-426: RLS-Hardening — Mitarbeiter sehen nur zugewiesene Fallakten
--
-- Problem: Die bestehende Policy "Mitarbeiter faelle" ON faelle gibt jedem
-- is_staff()-User (admin, kundenbetreuer, leadbearbeiter, dispatch) vollen
-- Lese- und Schreibzugriff auf ALLE Fälle. Das ist DSGVO-relevant (Daniel
-- sieht Sarahs Fälle ohne Zuweisung) und skaliert nicht mit dem Team.
--
-- Lösung: Policy rollenspezifisch aufsplitten:
--   - Admin  → unverändert (Policy "Admins full access" mit is_admin() bleibt)
--   - KB     → nur Fälle wo kundenbetreuer_id = auth.uid()
--   - LB     → eigene (leadbearbeiter_id = auth.uid()) + unzugewiesene (NULL)
--              (Inbox-Modus: LB schnappt sich frische Leads)
--   - Disp   → full access (verteilt Leads, braucht Gesamtsicht)
--
-- Policies sind OR-verknüpft — ein Admin matcht über "Admins full access",
-- ein KB matcht über "KB sieht nur zugewiesene Faelle", etc.
--
-- Impact: 4 aktive Fälle mit kundenbetreuer_id IS NULL werden für KBs
-- unsichtbar — das ist gewünscht (Admin/Dispatch weisen zu), KB darf keine
-- fremden Fälle einsehen. 5 aktive Fälle mit leadbearbeiter_id IS NULL
-- bleiben für LBs sichtbar (Inbox-Modus).

-- Alte Policy droppen
DROP POLICY IF EXISTS "Mitarbeiter faelle" ON public.faelle;

-- Kundenbetreuer — nur eigene zugewiesene Fälle
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

-- Leadbearbeiter — eigene + unzugewiesene (Inbox-Modus)
-- Bei INSERT/UPDATE: leadbearbeiter_id darf auf sich selbst zeigen oder NULL bleiben
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

-- Dispatcher — full access (verteilt Leads, braucht alle Fälle sichtbar)
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
  'AAR-426: DSGVO — Kundenbetreuer sehen ausschließlich Fälle mit kundenbetreuer_id = auth.uid().';
COMMENT ON POLICY "LB sieht eigene und unzugewiesene Faelle" ON public.faelle IS
  'AAR-426: Leadbearbeiter-Inbox — eigene + unzugewiesene (NULL) sichtbar, damit frische Leads geschnappt werden können.';
COMMENT ON POLICY "Dispatch full access faelle" ON public.faelle IS
  'AAR-426: Dispatch verteilt Leads, braucht Gesamtsicht über alle Fälle.';
