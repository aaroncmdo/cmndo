-- 2026-05-19: convert_anfrage_zu_lead erweitert um Round-Robin-Dispatch-Assignment.
--
-- Bisher: Lead landet ohne zugewiesen_an in der Liste — alle Dispatcher sehen
-- ihn, wer zuerst handelt claimt ihn (Self-Claim-by-Action). Bei mehreren
-- aktiven Dispatchern → Doppel-Call-Risiko.
--
-- Jetzt: Beim Convert wird der Dispatcher mit den wenigsten aktiven (= offenen)
-- Leads automatisch zugewiesen. Aktiv = rolle='dispatch'. Offen = leads.status
-- NOT IN (umgewandelt, umgewandelt-sv, disqualifiziert, kalt).
--
-- Tiebreak: random() — verhindert dass alle 0-Lead-Dispatcher immer denselben
-- First-Match bekommen.
--
-- Fallback: kein Dispatcher gefunden -> zugewiesen_an=NULL, Self-Claim-Pfad
-- bleibt wirksam wie vorher.
--
-- Spec: docs/19.05.2026/dispatch-routing-followup-plan.md (T1).
-- Idempotent: CREATE OR REPLACE FUNCTION ueberschreibt die bestehende Version
-- aus 20260518194304_fix_convert_function_security_and_branches.sql.

CREATE OR REPLACE FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anfrage       public.anfragen;
  v_lead_id       uuid;
  v_vorname       text;
  v_nachname      text;
  v_telefon       text;
  v_dispatcher_id uuid;
BEGIN
  -- 1. Anfrage holen mit Row-Lock (verhindert parallele Convert-Race)
  SELECT * INTO v_anfrage
  FROM public.anfragen
  WHERE id = p_anfrage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  -- Idempotenz: bereits konvertierte Anfragen geben bestehende lead_id zurueck
  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  -- 2. Name-Split "Max Mustermann" -> vorname="Max", nachname="Mustermann"
  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(
                  substr(trim(coalesce(v_anfrage.kontakt_name, '')),
                         length(v_vorname) + 2),
                  ''
                );
  v_telefon := trim(coalesce(v_anfrage.kontakt_telefon, ''));

  -- 3. Round-Robin: Dispatcher mit den wenigsten aktiven Leads finden.
  --    LEFT JOIN, damit 0-Lead-Dispatcher auch auftauchen. random() als
  --    Tiebreak. Nur rolle='dispatch' (Admins sehen alles, sind aber nicht
  --    First-Touch). Fallback NULL -> Self-Claim-Pattern bleibt wirksam.
  SELECT p.id INTO v_dispatcher_id
  FROM public.profiles p
  LEFT JOIN public.leads l
    ON l.zugewiesen_an = p.id
   AND l.status NOT IN ('umgewandelt', 'umgewandelt-sv', 'disqualifiziert', 'kalt')
  WHERE p.rolle = 'dispatch'::user_role
  GROUP BY p.id
  ORDER BY COUNT(l.id) ASC, random()
  LIMIT 1;

  -- 4. Lead anlegen — mit Round-Robin-Zuweisung (NULL falls kein Dispatcher).
  INSERT INTO public.leads (vorname, nachname, telefon, email, kunde_plz, zugewiesen_an)
  VALUES (
    NULLIF(v_vorname, ''),
    v_nachname,
    NULLIF(v_telefon, ''),
    v_anfrage.kontakt_email,
    v_anfrage.kontakt_plz_oder_stadt,
    v_dispatcher_id
  )
  RETURNING id INTO v_lead_id;

  -- 5. Channel-spezifische Side-Effects (unveraendert — gutachter + makler
  --    bleiben kommentiert wie in der Vorgaenger-Version).

  -- 6. Anfrage als konvertiert markieren
  UPDATE public.anfragen
     SET lead_id           = v_lead_id,
         konvertiert_am    = now(),
         konvertier_status = 'success'
   WHERE id = p_anfrage_id;

  RETURN v_lead_id;

EXCEPTION WHEN OTHERS THEN
  -- Best-effort Failure-Persistence (siehe Vorgaenger-Migration fuer Details
  -- zum plpgsql-Subtransaction-Verhalten).
  UPDATE public.anfragen
     SET konvertier_status = 'failed',
         konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$$;

-- REVOKE + GRANT — Sicherheit muss bei CREATE OR REPLACE explizit erneuert werden,
-- sonst koennen alte Grants verloren gehen.
REVOKE EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) TO authenticated;

COMMENT ON FUNCTION public.convert_anfrage_zu_lead(uuid) IS
  'Atomic: Anfrage -> Lead-Konvertierung. Setzt leads.zugewiesen_an via '
  'Round-Robin auf den Dispatcher mit den wenigsten offenen Leads '
  '(NULL falls keine Dispatcher existieren). FOR UPDATE gegen Race. '
  'Idempotent: existierende anfrage.lead_id wird zurueckgegeben.';
