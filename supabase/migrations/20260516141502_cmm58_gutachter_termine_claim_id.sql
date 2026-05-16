-- CMM-58 — Phase-0-Vorarbeit der Claim-SSoT-Vollmigration.
--
-- gutachter_termine ist die einzige Sub-Tabelle ohne claim_id-FK — sie haengt
-- nur an fall_id. Der RLS-Audit nennt das einen strukturellen Blocker: ohne
-- claim_id laesst sich weder Phase 2 (Termin-Migration) noch eine der vier
-- gutachter_termine-RLS-Policies migrieren.
--
-- Diese Migration legt nur die strukturelle Grundlage: Spalte + FK + Index +
-- Backfill + ein Trigger, der claim_id ohne Writer-Aenderung aus fall_id
-- ableitet. Die Reader/Writer-Migration und die View-Anpassung
-- (v_faelle_mit_aktuellem_termin) folgen als eigener Schritt (Phase 2).
--
-- Strategie: docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md §3.3.
-- Live-Stand 2026-05-16: 18 gutachter_termine, 6 mit fall_id->claim aufloesbar,
-- 12 mit fall_id=NULL (claim-lose Admin-/Konfrontations-Termine).

BEGIN;

-- 1. Spalte + FK. Nullable, weil 12 von 18 Rows fall_id=NULL haben — NOT NULL
--    waere nicht erfuellbar. ON DELETE SET NULL: ein geloeschter Claim soll
--    den Termin nicht mitloeschen, die Termin-Historie bleibt erhalten.
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS claim_id uuid
  REFERENCES public.claims(id) ON DELETE SET NULL;

-- 2. Index fuer Joins / Lookups ueber claim_id.
CREATE INDEX IF NOT EXISTS idx_gutachter_termine_claim_id
  ON public.gutachter_termine(claim_id);

-- 3. Einmal-Backfill aus fall_id -> faelle.claim_id.
UPDATE public.gutachter_termine gt
SET claim_id = f.claim_id
FROM public.faelle f
WHERE gt.fall_id = f.id
  AND gt.claim_id IS NULL
  AND f.claim_id IS NOT NULL;

-- 4. Trigger: haelt claim_id populiert, ohne dass jeder Writer es explizit
--    setzen muss. Wenn fall_id gesetzt ist, wird claim_id daraus abgeleitet
--    (Invariante: claim_id spiegelt faelle.claim_id des verknuepften Falls).
--    Feuert BEFORE INSERT und BEFORE UPDATE OF fall_id. Ein UPDATE, das nur
--    claim_id setzt (kuenftiger Phase-2-Writer), feuert NICHT -> claim_id kann
--    dann frei direkt geschrieben werden. SECURITY DEFINER, damit der
--    faelle-Read unabhaengig von der RLS des Insertenden funktioniert (analog
--    sync_faelle_to_claims).
CREATE OR REPLACE FUNCTION public.sync_gutachter_termine_claim_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.fall_id IS NOT NULL THEN
    SELECT f.claim_id INTO NEW.claim_id
    FROM public.faelle f
    WHERE f.id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_gutachter_termine_claim_id ON public.gutachter_termine;
CREATE TRIGGER trg_sync_gutachter_termine_claim_id
  BEFORE INSERT OR UPDATE OF fall_id ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.sync_gutachter_termine_claim_id();

COMMENT ON COLUMN public.gutachter_termine.claim_id IS
  'CMM-58: FK auf claims. Vom Trigger sync_gutachter_termine_claim_id aus fall_id abgeleitet. Phase-2-Voraussetzung der Claim-SSoT-Migration.';

COMMIT;
