-- Der Beratungstermin verfiel eine Stunde nach ANLAGE statt nach dem Termin.
--
-- Befund 01.09.2026: Die "grobe Legacy-Regel" (zweiter OR-Zweig) hat in sechs Wochen
-- 15 Termine storniert -- ALLE 15 vom Typ kb_beratung, kein einziger sv_begutachtung.
-- 5 davon gehoerten echten Interessenten. Sie verfehlt damit ihr eigenes Ziel zu 100 %:
-- die Funktion heisst "ohne_sa" und soll SV-Kalender freigeben, wenn keine
-- Sicherungsabtretung kommt. Fuer eine telefonische Beratung braucht es keine SA.
--
-- Warum sie nur kb_beratung trifft: die Bedingung `fall_id IS NULL` beschreibt die
-- Lead-Phase, und dort existieren ausschliesslich Beratungstermine -- Gutachtertermine
-- entstehen spaeter, wenn ein Fall da ist.
--
-- Konkreter Schaden (Lead 5c39b0ac, /check, 30.08.): 22:12 Lead + automatischer
-- Beratungstermin fuer den Folgetag 10:00, 23:15 storniert. Der Kundenbetreuer haette
-- angerufen -- es stand nur nichts mehr im Kalender. Messung danach: NULL reservierte
-- kb_beratung-Termine im ganzen Bestand. Die Regel raeumte restlos jeden ab.
--
-- Aenderung, minimal-invasiv:
--   * Zweig 1 (Engine-TTL ueber reserviert_bis) UNVERAENDERT.
--   * Zweig 2 (1h ab Anlage) gilt jetzt nur noch fuer NICHT-Beratungstermine.
--     Fuer sv_begutachtung bleibt alles wie bisher (39 der 59 haben kein fall_id,
--     30 nutzen die Engine-TTL) -- kein Verhaltenswechsel dort.
--   * Zweig 3 NEU: ein Beratungstermin ist hinfaellig, wenn der Termin SELBST
--     vorbei ist (+2h Karenz, falls der KB verspaetet anruft). Bis dahin steht er
--     im Kalender -- das ist der Zweck eines Terminangebots.
--
-- Vorbedingung geprueft: start_zeit ist bei allen 31 kb_beratung-Terminen gesetzt,
-- reserviert_bis bei 0 von 31 -- Zweig 1 greift dort also nie und kann den neuen
-- Zweig nicht ueberholen.
CREATE OR REPLACE FUNCTION public.expire_geblockte_termine_ohne_sa()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.gutachter_termine
       SET status = 'storniert', cancelled_at = now(), updated_at = now()
     WHERE status = 'reserviert'
       AND (
         -- feine Engine-TTL (unveraendert)
         (reserviert_bis IS NOT NULL AND reserviert_bis < now())
         -- grobe Legacy-Regel: nur noch fuer Nicht-Beratungstermine
         OR (reserviert_bis IS NULL AND fall_id IS NULL
             AND created_at < now() - interval '1 hour'
             AND typ <> 'kb_beratung')
         -- Beratungstermin: hinfaellig erst, wenn der Termin selbst vorbei ist
         OR (typ = 'kb_beratung'
             AND coalesce(end_zeit, start_zeit) < now() - interval '2 hours')
       )
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$function$;