-- Ops-Test 13.08.: 'dringend' im Dispatch-Bereich wieder zu einem Signal machen.
--
-- BEFUND: ALLE 347 offenen Dispatch-Aufgaben standen auf 'dringend'. Wenn alles dringend
-- ist, ist nichts dringend -- eine Sortierung oder Hervorhebung nach Prioritaet war damit
-- wertlos, und die 20 echten Eskalationen (Faelle ohne Bewegung, #5223) gingen zwischen
-- 326 Routine-Aufgaben unter.
--
-- URSACHE: zwei Cron-Erzeuger setzten pauschal 'dringend' und stellen zusammen ~94 % des
-- Bestands. Beide sind im Kern ROUTINE:
--   * flowlink-inaktiv    (101) -- Kunde hat seinen Link noch nicht geoeffnet -> Nachfassen
--   * dispatch-lead-alert (225) -- frisch eingegangener Lead noch nicht aufgegriffen
-- Der Code-Fix (beide auf 'normal') liegt im selben PR; diese Migration zieht den Bestand nach.
--
-- Dass das Feld generell benutzbar ist, zeigt der Blick ueber ALLE Tasks:
-- dringend=1806, normal=107, kritisch=96 -- andere Erzeuger differenzieren durchaus.
-- Entwertet war es nur im Dispatch-Bereich.
--
-- WAS 'dringend' BLEIBT (echte Eskalation, bewusst unangetastet):
--   haenger-pruefen (20)         -- Fall steht >= 5 Tage still
--   embed_b_termin_klaerung (1)  -- ungeklaerter Gutachter-Termin
-- Ergebnis (verifiziert): 326 normal, 21 dringend.
--
-- Bewusst ENG gefiltert: task_typ bzw. exakter Titel-Praefix, nur status='offen'.
-- Erledigte bleiben unberuehrt (ihre Prioritaet ist Historie), und kennungslose Tasks
-- fremder Erzeuger werden NICHT pauschal mitgeaendert -- deshalb der Titel-Filter
-- statt "task_typ IS NULL".
--
-- ROLLBACK: update public.tasks set prioritaet='dringend'
--            where typ='dispatch' and status='offen' and prioritaet='normal'
--              and (task_typ='inaktiv_followup' or titel like 'Lead unbearbeitet:%');

update public.tasks
   set prioritaet = 'normal'
 where typ = 'dispatch'
   and status = 'offen'
   and prioritaet = 'dringend'
   and (task_typ = 'inaktiv_followup' or titel like 'Lead unbearbeitet:%');
