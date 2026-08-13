-- Ops-Test 12.08.: Die Haenger-Tasks auf das echte Dispatch-Konto umhaengen.
--
-- BEFUND: Das Task-Auto-Assign (lib/tasks/auto-assign.ts) verteilt Round-Robin an ALLE
-- aktiven Profile einer Rolle. Bei 'dispatch' sind 4 von 5 aktiven Konten Test-/Smoke-
-- Konten (test-dispatch@, smoke-enroll@, 2x bkat-smoke-dispatch-*@) -- ~80 % der Tasks
-- landeten damit in Postfaechern, die niemand ansieht. Prod-Messung: 29 von 61 offenen
-- Tasks (48 %) lagen bei solchen Konten.
--
-- Das erklaert, warum haengende Faelle liegenblieben, OBWOHL sie offene Tasks hatten:
-- die Tasks existierten, nur nicht bei einem Menschen.
--
-- Der Code-Fix (Test-Konten aus dem Round-Robin, lib/testdaten/ist-test-konto.ts) liegt
-- im selben PR; diese Migration raeumt die 15 Tasks auf, die der erste Haenger-Detektor-
-- Lauf (Regel-4-Nachweis) erzeugt hat.
--
-- Bewusst ENG: nur task_code='haenger-pruefen'. Die uebrigen ~14 fehlgeleiteten Tasks
-- stammen aus anderen Erzeugern und werden separat gemeldet, nicht hier still
-- mitgeaendert.
--
-- Die Ziel-ID wird ueber die E-Mail aufgeloest statt hartkodiert. Findet sich kein
-- echtes Dispatch-Konto, aendert die Migration nichts (kein NULL-Clobber).
--
-- Verifiziert: danach liegen alle 15 offenen haenger-pruefen-Tasks bei dispatch@claimondo.de.

update public.tasks t
set zugewiesen_an = ziel.id,
    empfaenger_user_id = ziel.id
from (
  select p.id
  from public.profiles p
  where p.rolle = 'dispatch'
    and p.aktiv is not false
    and p.email = 'dispatch@claimondo.de'
  limit 1
) as ziel
where t.task_code = 'haenger-pruefen'
  and t.status <> 'erledigt'
  and t.zugewiesen_an is distinct from ziel.id;
