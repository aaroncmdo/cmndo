-- Phase 2c: Staffel-Bonus-Vergabe re-ankern auf partner_provisionen -> partner_staffel_bonus.
-- award_*-Fns zaehlen jetzt partner_provisionen (typ-gefiltert) + inserten partner_staffel_bonus;
-- neuer Trigger auf partner_provisionen (typ-verzweigt); Alt-Trigger auf den Alt-Tabellen gedroppt.
-- Config-Stufen (makler_staffel_stufen/werkstatt_staffel_stufen) BLEIBEN (Schwellen-Quelle).
-- Backfill (Phase 2a) macht den count korrekt (partner_provisionen haelt den Bestand).

CREATE UNIQUE INDEX IF NOT EXISTS partner_staffel_bonus_typ_partner_schwelle_uniq
  ON public.partner_staffel_bonus (partner_typ, partner_id, schwelle);

CREATE OR REPLACE FUNCTION public.award_makler_staffel_boni(p_makler_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF p_makler_id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.partner_provisionen
   WHERE partner_typ = 'makler' AND partner_id = p_makler_id AND status IN ('freigegeben','ausgezahlt');
  INSERT INTO public.partner_staffel_bonus
    (partner_typ, partner_id, stufe_id, schwelle, bonus_betrag_netto, status)
  SELECT 'makler', s.makler_id, s.id, s.schwelle, s.bonus_betrag_netto, 'freigegeben'
    FROM public.makler_staffel_stufen s
   WHERE s.makler_id = p_makler_id AND s.schwelle <= v_count
  ON CONFLICT (partner_typ, partner_id, schwelle) DO NOTHING;
END; $function$;

CREATE OR REPLACE FUNCTION public.award_werkstatt_staffel_boni(p_werkstatt_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF p_werkstatt_id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.partner_provisionen
   WHERE partner_typ = 'werkstatt' AND partner_id = p_werkstatt_id AND status IN ('freigegeben','ausgezahlt');
  INSERT INTO public.partner_staffel_bonus
    (partner_typ, partner_id, stufe_id, schwelle, bonus_betrag_netto, status)
  SELECT 'werkstatt', s.werkstatt_id, s.id, s.schwelle, s.bonus_betrag_netto, 'freigegeben'
    FROM public.werkstatt_staffel_stufen s
   WHERE s.werkstatt_id = p_werkstatt_id AND s.schwelle <= v_count
  ON CONFLICT (partner_typ, partner_id, schwelle) DO NOTHING;
END; $function$;

CREATE OR REPLACE FUNCTION public.trg_award_partner_staffel()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.partner_typ = 'makler' THEN
    PERFORM public.award_makler_staffel_boni(NEW.partner_id);
  ELSIF NEW.partner_typ = 'werkstatt' THEN
    PERFORM public.award_werkstatt_staffel_boni(NEW.partner_id);
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_award_partner_staffel ON public.partner_provisionen;
CREATE TRIGGER trg_award_partner_staffel
  AFTER INSERT OR UPDATE OF status ON public.partner_provisionen
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_partner_staffel();

-- Alt-Award-Trigger abschalten (die award_*-Fns zaehlen jetzt partner_provisionen -> ein
-- Alt-Tabellen-UPDATE wuerde inkonsistent zaehlen; + Redundanz zum neuen Trigger vermeiden).
DROP TRIGGER IF EXISTS trg_award_makler_staffel ON public.makler_provisionen;
DROP TRIGGER IF EXISTS trg_award_staffel ON public.werkstatt_provisionen;
