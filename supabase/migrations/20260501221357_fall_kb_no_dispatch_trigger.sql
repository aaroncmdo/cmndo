-- Hard-Guard: faelle.kundenbetreuer_id darf NIE auf einen Dispatcher zeigen.
-- Dispatcher haben keinen Zugriff auf die Fallakte und duerfen damit auch
-- nicht zugewiesen werden. Akzeptiert: rolle in (kundenbetreuer, admin).
--
-- Geschichte: AAR-427 RoundRobin nutzte rolle=kundenbetreuer korrekt, aber
-- convert-lead-to-claim hat lead.zugewiesen_an (= Dispatcher der den Lead
-- qualifiziert hat) als Default genommen — dadurch landeten Dispatcher als
-- KBs auf den Faellen. Code-Validation in convert-lead-to-claim ist die
-- erste Barriere, dieser Trigger der unwiderrufliche zweite.

CREATE OR REPLACE FUNCTION public.fall_validate_kb_rolle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  kb_rolle text;
BEGIN
  IF NEW.kundenbetreuer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT rolle INTO kb_rolle
  FROM public.profiles
  WHERE id = NEW.kundenbetreuer_id;

  IF kb_rolle IS NULL THEN
    RAISE EXCEPTION
      'kundenbetreuer_id %: profiles-Eintrag nicht gefunden',
      NEW.kundenbetreuer_id;
  END IF;

  IF kb_rolle NOT IN ('kundenbetreuer', 'admin') THEN
    RAISE EXCEPTION
      'kundenbetreuer_id % hat unzulaessige Rolle "%". Erlaubt: kundenbetreuer, admin',
      NEW.kundenbetreuer_id, kb_rolle;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fall_validate_kb_rolle ON public.faelle;
CREATE TRIGGER trg_fall_validate_kb_rolle
  BEFORE INSERT OR UPDATE OF kundenbetreuer_id ON public.faelle
  FOR EACH ROW
  EXECUTE FUNCTION public.fall_validate_kb_rolle();

COMMENT ON FUNCTION public.fall_validate_kb_rolle IS
  'Verhindert dass faelle.kundenbetreuer_id auf einen Dispatcher zeigt. '
  'Erlaubt nur Rolle kundenbetreuer oder admin.';
