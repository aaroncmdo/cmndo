-- Befund B2 (Dashboard-Inventur 19.09.2026): Reservierte Beratungstermine verfielen STILL.
--
-- Seit 20260901112254 storniert Zweig 3 einen kb_beratung-Termin 2 h nach Terminende. Das ist
-- richtig -- nur erfuhr niemand davon: 12 Termine sind so verfallen, ohne Aufgabe, ohne Mitteilung.
-- Ein Kunde, der weder im Flow bestaetigt hat noch angerufen wurde, war damit einfach weg.
--
-- Aenderung: der Verfall selbst bleibt unveraendert (alle drei Zweige identisch). NEU: fuer jeden
-- verfallenen Beratungstermin mit Lead entsteht
--   * eine Aufgabe (tasks: typ 'dispatch', task_code 'kb_beratung_verfallen', prioritaet 'dringend',
--     zugewiesen an den Kundenbetreuer des Termins, faellig in 4 h) -- sichtbar in den Aufgabenlisten
--     von Admin/Dispatch und im Kalender; einmalig je Termin (Dedupe ueber entity_id + task_code),
--   * eine Mitteilung an den Kundenbetreuer (kategorie 'task', Kontext lead), wenn ein KB bekannt ist.
-- Die Meldung ist fail-soft: scheitert sie, bleibt der Verfall trotzdem wirksam (WARNING statt Abbruch),
-- damit ein Meldefehler nie den Kalender blockiert.
CREATE OR REPLACE FUNCTION public.expire_geblockte_termine_ohne_sa()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_count integer := 0;
BEGIN
  WITH expired AS (
    UPDATE public.gutachter_termine
       SET status = 'storniert', cancelled_at = now(), updated_at = now()
     WHERE status = 'reserviert'
       AND (
         -- feine Engine-TTL (unveraendert)
         (reserviert_bis IS NOT NULL AND reserviert_bis < now())
         -- grobe Legacy-Regel: nur fuer Nicht-Beratungstermine
         OR (reserviert_bis IS NULL AND fall_id IS NULL
             AND created_at < now() - interval '1 hour'
             AND typ <> 'kb_beratung')
         -- Beratungstermin: hinfaellig erst, wenn der Termin selbst vorbei ist
         OR (typ = 'kb_beratung'
             AND coalesce(end_zeit, start_zeit) < now() - interval '2 hours')
       )
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_ids FROM expired;
  v_count := coalesce(array_length(v_ids, 1), 0);

  -- NEU (19.09.2026): verfallene Beratungstermine melden -- fail-soft.
  IF v_count > 0 THEN
    BEGIN
      INSERT INTO public.tasks (typ, task_code, titel, beschreibung, status, prioritaet, zugewiesen_an, empfaenger_rolle,
                                faellig_am, lead_id, entity_type, entity_id, auto_erstellt, trigger_event)
      SELECT 'dispatch', 'kb_beratung_verfallen',
             'Beratungstermin verfallen – Kunde anrufen: '
               || coalesce(nullif(trim(coalesce(l.vorname, '') || ' ' || coalesce(l.nachname, '')), ''), 'unbekannt'),
             'Der reservierte Beratungstermin am '
               || to_char(gt.start_zeit AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY HH24:MI')
               || ' Uhr wurde weder bestätigt noch wahrgenommen und ist verfallen. Bitte den Kunden anrufen'
               || coalesce(' (' || l.telefon || ')', '') || ' und einen neuen Termin vereinbaren.',
             'offen', 'dringend',
             coalesce(gt.kb_id, CASE WHEN gt.assignee_typ = 'kundenbetreuer' THEN gt.assignee_id END),
             'kundenbetreuer',
             now() + interval '4 hours', gt.lead_id, 'termin', gt.id, true, 'kb_beratung_verfallen'
        FROM public.gutachter_termine gt
        JOIN public.leads l ON l.id = gt.lead_id
       WHERE gt.id = ANY(v_ids)
         AND gt.typ = 'kb_beratung'
         AND NOT EXISTS (
           SELECT 1 FROM public.tasks t WHERE t.entity_id = gt.id AND t.task_code = 'kb_beratung_verfallen'
         );

      INSERT INTO public.mitteilungen (empfaenger_id, empfaenger_rolle, kategorie, titel, inhalt, kontext_typ, kontext_id, route_url, icon, prioritaet)
      SELECT coalesce(gt.kb_id, CASE WHEN gt.assignee_typ = 'kundenbetreuer' THEN gt.assignee_id END),
             'kundenbetreuer', 'task',
             'Beratungstermin verfallen – Kunde anrufen',
             'Der reservierte Beratungstermin am '
               || to_char(gt.start_zeit AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY HH24:MI')
               || ' Uhr mit '
               || coalesce(nullif(trim(coalesce(l.vorname, '') || ' ' || coalesce(l.nachname, '')), ''), 'dem Kunden')
               || ' wurde nicht bestätigt und ist verfallen. Bitte anrufen und neu terminieren.',
             'lead', gt.lead_id, '/mitarbeiter/tasks', '📞', 'hoch'
        FROM public.gutachter_termine gt
        JOIN public.leads l ON l.id = gt.lead_id
       WHERE gt.id = ANY(v_ids)
         AND gt.typ = 'kb_beratung'
         AND coalesce(gt.kb_id, CASE WHEN gt.assignee_typ = 'kundenbetreuer' THEN gt.assignee_id END) IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'expire_geblockte_termine_ohne_sa: Meldung des Verfalls fehlgeschlagen: %', SQLERRM;
    END;
  END IF;

  RETURN v_count;
END;
$function$;
