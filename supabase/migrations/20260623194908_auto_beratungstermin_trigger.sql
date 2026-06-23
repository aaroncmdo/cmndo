-- AAR-956 Auto-Beratungstermin: AFTER INSERT ON leads legt fuer jeden in-scope Lead
-- einen kb_beratung-Termin in gutachter_termine an (Pool-KB least-loaded, Default naechster
-- Werktag 10:00 Berlin). Owner = leads.zugewiesen_an (nur gesetzt wenn vorher NULL).
-- Defensiv: ein Fehler darf die Lead-Anlage NIE brechen (EXCEPTION-Kapsel).
CREATE OR REPLACE FUNCTION public.create_auto_beratungstermin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_kb uuid;
  v_tag date;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  -- Scope-Gate: nur frische, kontaktierbare, nicht-disqualifizierte, nicht-Test-Leads.
  IF NEW.status IS DISTINCT FROM 'neu'
     OR NEW.disqualifiziert IS TRUE
     OR NEW.source_channel = 'test'
     OR (NEW.telefon IS NULL AND NEW.email IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Idempotenz: kein zweiter Auto-Termin pro Lead.
  IF EXISTS (SELECT 1 FROM public.gutachter_termine WHERE lead_id = NEW.id AND typ = 'kb_beratung') THEN
    RETURN NEW;
  END IF;

  -- Beratungs-KB bestimmen. STRIKT rolle='kundenbetreuer' (validate_assignee verbietet Admin).
  -- Bestehenden KB-Owner wiederverwenden, sonst least-loaded Pool-KB (Tie-Break id).
  IF NEW.zugewiesen_an IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = NEW.zugewiesen_an AND rolle = 'kundenbetreuer' AND aktiv = true) THEN
    v_kb := NEW.zugewiesen_an;
  ELSE
    SELECT p.id INTO v_kb
    FROM public.profiles p
    WHERE p.rolle = 'kundenbetreuer' AND p.aktiv = true
    ORDER BY (
      SELECT count(*) FROM public.gutachter_termine t
      WHERE t.assignee_id = p.id AND t.typ = 'kb_beratung'
        AND t.status IN ('reserviert','bestaetigt')
    ) ASC, p.id
    LIMIT 1;
  END IF;

  -- Schadenberater setzen, nur wenn unbesetzt (Dispatch-Owner nicht ueberschreiben).
  IF NEW.zugewiesen_an IS NULL AND v_kb IS NOT NULL THEN
    UPDATE public.leads SET zugewiesen_an = v_kb WHERE id = NEW.id;
  END IF;

  -- Default-Zeit: naechster Werktag 10:00 Europe/Berlin.
  v_tag := (now() AT TIME ZONE 'Europe/Berlin')::date + 1;
  IF extract(dow from v_tag) = 6 THEN v_tag := v_tag + 2;      -- Sa -> Mo
  ELSIF extract(dow from v_tag) = 0 THEN v_tag := v_tag + 1;   -- So -> Mo
  END IF;
  v_start := (v_tag + time '10:00') AT TIME ZONE 'Europe/Berlin';
  v_end := v_start + interval '30 minutes';

  -- Insert. fall_id/claim_id bleiben NULL (kein Claim zur Lead-Zeit -> validate_claim_id erlaubt das).
  -- 0-KB-Fallback: assignee_typ + assignee_id + kb_id alle NULL (Dispatch-Queue).
  INSERT INTO public.gutachter_termine
    (lead_id, typ, assignee_typ, assignee_id, kb_id, status, kanal, start_zeit, end_zeit)
  VALUES
    (NEW.id, 'kb_beratung',
     CASE WHEN v_kb IS NULL THEN NULL ELSE 'kundenbetreuer' END,
     v_kb, v_kb,
     'reserviert', 'telefon', v_start, v_end);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ein Beratungstermin-Fehler darf die Lead-Anlage NIE brechen.
  RAISE WARNING 'create_auto_beratungstermin failed for lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_beratungstermin_on_lead ON public.leads;
CREATE TRIGGER trg_auto_beratungstermin_on_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.create_auto_beratungstermin();
