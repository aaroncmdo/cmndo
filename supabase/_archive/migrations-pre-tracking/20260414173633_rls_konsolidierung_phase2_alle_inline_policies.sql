-- ============================================================================
-- RLS-Konsolidierung Phase 2: Restliche 7 Inline-EXISTS-Policies konsolidieren
-- Datum: 14.04.2026
-- Zweck: dispatch + leadbearbeiter Rollen-Lücken in dokumente/parteien/forderungen/qc/zahlungen schliessen
-- ============================================================================

-- ─── Helper: is_kanzlei() neue Funktion ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_kanzlei()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'kanzlei'
  );
$function$;

COMMENT ON FUNCTION public.is_kanzlei() IS 'Returns true if current user has the kanzlei role. Wird in Policies fuer Kanzlei-spezifischen Zugriff verwendet.';

-- ─── 1. dokumente: Mitarbeiter-Policy konsolidieren ──────────────────────
DROP POLICY IF EXISTS "Mitarbeiter dokumente" ON dokumente;
CREATE POLICY "Mitarbeiter dokumente" ON dokumente
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 2. parteien: Mitarbeiter-Policy konsolidieren ───────────────────────
DROP POLICY IF EXISTS "Mitarbeiter parteien" ON parteien;
CREATE POLICY "Mitarbeiter parteien" ON parteien
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 3. schadenspositionen: Mitarbeiter-Policy konsolidieren ─────────────
DROP POLICY IF EXISTS "Mitarbeiter schadenspositionen" ON schadenspositionen;
CREATE POLICY "Mitarbeiter schadenspositionen" ON schadenspositionen
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 4. forderungspositionen: Mitarbeiter ODER Kanzlei ────────────────────
DROP POLICY IF EXISTS "Admin full access forderungen" ON forderungspositionen;
DROP POLICY IF EXISTS "Mitarbeiter forderungspositionen" ON forderungspositionen;
CREATE POLICY "Mitarbeiter forderungspositionen" ON forderungspositionen
  FOR ALL
  USING (is_staff() OR is_kanzlei())
  WITH CHECK (is_staff() OR is_kanzlei());

-- ─── 5. qc_checkliste: Mitarbeiter konsolidieren ────────────────────────
DROP POLICY IF EXISTS "Admins full access on qc_checkliste" ON qc_checkliste;
DROP POLICY IF EXISTS "Mitarbeiter qc_checkliste" ON qc_checkliste;
CREATE POLICY "Mitarbeiter qc_checkliste" ON qc_checkliste
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 6. zahlungseingaenge: Mitarbeiter konsolidieren ────────────────────
DROP POLICY IF EXISTS "Admin zahlungseingaenge" ON zahlungseingaenge;
DROP POLICY IF EXISTS "Mitarbeiter zahlungseingaenge" ON zahlungseingaenge;
CREATE POLICY "Mitarbeiter zahlungseingaenge" ON zahlungseingaenge
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 7. zahlungspositionen: Mitarbeiter konsolidieren ────────────────────
DROP POLICY IF EXISTS "Admin zahlungspositionen" ON zahlungspositionen;
DROP POLICY IF EXISTS "Mitarbeiter zahlungspositionen" ON zahlungspositionen;
CREATE POLICY "Mitarbeiter zahlungspositionen" ON zahlungspositionen
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());;
