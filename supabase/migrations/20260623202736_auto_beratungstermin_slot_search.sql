-- AAR-956 Auto-Beratungstermin C1-Fix (Final-Review opus): fester Default 10:00 kollidierte mit
-- EXCLUDE gutachter_termine_no_assignee_overlap (ein KB kann nicht zwei ueberlappende kb_beratung
-- haben) -> ab dem 3. in-scope Lead/Tag (bei 2 KB) warf der INSERT, von der EXCEPTION-Kapsel
-- geschluckt -> Lead ohne Termin. Fix: erste freie 30-min-Luecke des gewaehlten KB suchen
-- (Arbeitsfenster 10:00-17:00 Berlin, rollt auf Folge-Werktage). Praedikat == Constraint.
-- Live-verifiziert: 3-Lead-Probe -> 1/1/1 (l3 staggered KB_A 10:30 statt Kollision).
CREATE OR REPLACE FUNCTION public.create_auto_beratungstermin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_kb uuid;
  v_tag date;
  v_start timestamptz;
  v_end timestamptz;
  i int;
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

  -- Default-Zeit-Basis: naechster Werktag 10:00 Europe/Berlin.
  v_tag := (now() AT TIME ZONE 'Europe/Berlin')::date + 1;
  IF extract(dow from v_tag) = 6 THEN v_tag := v_tag + 2;      -- Sa -> Mo
  ELSIF extract(dow from v_tag) = 0 THEN v_tag := v_tag + 1;   -- So -> Mo
  END IF;
  v_start := (v_tag + time '10:00') AT TIME ZONE 'Europe/Berlin';

  -- Bei gesetztem KB: erste freie 30-min-Luecke ab Basis suchen. Praedikat identisch zum
  -- EXCLUDE-Constraint (assignee_typ='kundenbetreuer' + assignee_id + Status + cancelled_at +
  -- Range-Overlap). Arbeitsfenster 10:00-17:00 Berlin, rollt auf Folge-Werktage. Bound 200.
  -- (0-KB-Fallback: assignee_id NULL -> kein EXCLUDE-Match -> kein Slot-Search noetig.)
  IF v_kb IS NOT NULL THEN
    FOR i IN 1..200 LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.gutachter_termine t
        WHERE t.assignee_typ = 'kundenbetreuer' AND t.assignee_id = v_kb
          AND t.status IN ('bestaetigt','reserviert','verlegt','verlegung_pending')
          AND t.cancelled_at IS NULL
          AND tstzrange(t.start_zeit, t.end_zeit) && tstzrange(v_start, v_start + interval '30 minutes')
      );
      v_start := v_start + interval '30 minutes';
      IF (v_start AT TIME ZONE 'Europe/Berlin')::time >= time '17:00' THEN
        v_tag := v_tag + 1;
        IF extract(dow from v_tag) = 6 THEN v_tag := v_tag + 2;
        ELSIF extract(dow from v_tag) = 0 THEN v_tag := v_tag + 1;
        END IF;
        v_start := (v_tag + time '10:00') AT TIME ZONE 'Europe/Berlin';
      END IF;
    END LOOP;
  END IF;
  v_end := v_start + interval '30 minutes';

  -- Insert. fall_id/claim_id bleiben NULL (kein Claim zur Lead-Zeit).
  INSERT INTO public.gutachter_termine
    (lead_id, typ, assignee_typ, assignee_id, kb_id, status, kanal, start_zeit, end_zeit)
  VALUES
    (NEW.id, 'kb_beratung',
     CASE WHEN v_kb IS NULL THEN NULL ELSE 'kundenbetreuer' END,
     v_kb, v_kb,
     'reserviert', 'telefon', v_start, v_end);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_auto_beratungstermin failed for lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END; $$;
