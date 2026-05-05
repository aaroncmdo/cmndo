-- CMM Phase 1.5c (2026-05-05) — Business-Constraint:
-- Nachbesichtigung & Stellungnahme dürfen NUR existieren wenn der Claim
-- bereits einen kanzlei_faelle-Eintrag hat (= Erstgutachten ist QC-freigegeben
-- und die Regulierung läuft).
--
-- Heute existiert noch kein Code-Pfad der diese Auftraege erzeugt — die Regel
-- ist faktisch eingehalten. Mit diesem Trigger wird sie DB-side hart erzwungen,
-- damit künftige Caller (UI-Buttons im Kanzlei-Portal, LexDrive-Webhooks,
-- Admin-Actions) sie nicht versehentlich brechen können.
--
-- Erstgutachten ist von der Regel ausgenommen — es ist der Initial-Auftrag
-- und entsteht beim Lead→Claim-Konvertieren oder durch manuelle Dispatcher-
-- Beauftragung, lange vor dem ersten Kanzleifall.

CREATE OR REPLACE FUNCTION public.auftraege_validate_typ_requires_kanzleifall()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.typ IN ('nachbesichtigung', 'stellungnahme') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.kanzlei_faelle WHERE claim_id = NEW.claim_id
    ) THEN
      RAISE EXCEPTION
        'Auftrag-Typ % nur zulässig wenn der Claim einen Kanzleifall hat (claim_id=%)',
        NEW.typ, NEW.claim_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auftraege_validate_typ_requires_kanzleifall ON public.auftraege;
CREATE TRIGGER trg_auftraege_validate_typ_requires_kanzleifall
BEFORE INSERT OR UPDATE OF typ, claim_id ON public.auftraege
FOR EACH ROW
EXECUTE FUNCTION public.auftraege_validate_typ_requires_kanzleifall();

COMMENT ON FUNCTION public.auftraege_validate_typ_requires_kanzleifall() IS
  'CMM Phase 1.5c: Verhindert dass Nachbesichtigungs- oder Stellungnahme-Auftraege ohne existierenden Kanzleifall angelegt werden. Erstgutachten ist ausgenommen.';
