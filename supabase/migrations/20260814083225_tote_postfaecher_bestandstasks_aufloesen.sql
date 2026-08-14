-- Ops-Test 13.08. (Aaron-Entscheid): die 16 Bestands-Tasks aufloesen, die in Test-/Smoke-
-- Postfaechern lagen. Der Code-Fix #5232 verhindert NEUE Fehlleitungen (verifiziert: 93 Tasks
-- seit Deploy, 5 zugewiesen, 0 an Test-Konten); der Bestand blieb bewusst liegen.
--
-- BEFUND: `lib/tasks/auto-assign.ts` verteilte Round-Robin an ALLE aktiven Profile einer
-- Rolle. Bei 'dispatch' waren 4 von 5 aktiven Konten Test-Konten -- 48 % aller offenen Tasks
-- lagen in Postfaechern, die niemand ansieht. Darunter Warnungen ueber eine fehlgeschlagene
-- SV-Kalender-Verbindung (26.07.-05.08.).
--
-- TEIL 1 -- 11 gegenstandslose schliessen:
--   3  Claim ist storniert            -> die Aufgabe hat sich erledigt
--   3  Kunde ist ein Testkonto        -> Smoke-Residue
--   3  "Async-Op gescheitert"         -> technische Sammelmeldung ohne Bezug, Wochen alt
--   2  "Partner aktivieren"           -> BEIDE Werkstaetten stehen laengst auf 'aktiv';
--                                        die Aufgabe wurde erledigt, nur der Task blieb offen
--
-- TEIL 2 -- 5 mit moeglichem Bezug auf ECHTE Konten umhaengen:
--   3  "Kalender-Verbindung ... fehlgeschlagen" -> admin@claimondo.de
--   2  "VS-Meldung manuell ..." (Claims in ersterfassung vom 19./22.07.) -> dispatch@claimondo.de
--   Bewusst NICHT geschlossen: bei diesen beiden ist kein Name aufloesbar, sie sind aber auch
--   nicht als Test erkennbar. Falls echt, wartet jemand seit ~3 Wochen -- dann gehoeren sie
--   in ein gelesenes Postfach, nicht in den Papierkorb.
--
-- SICHERHEIT: auf `tasks` liegen NUR zwei BEFORE-Trigger (claim_id-Ableitung, updated_at) --
-- kein AFTER-Trigger, also loest dieses Update keine Benachrichtigung aus.
-- Ziel-IDs werden ueber die E-Mail aufgeloest statt hartkodiert.
--
-- ERGEBNIS (verifiziert): 0 Tasks verbleiben in toten Postfaechern; 11 geschlossen;
-- 3 an admin@, 2 an dispatch@ umgehaengt; die 20 Haenger-Tasks (#5223) unveraendert.
--
-- ⚠ Nebenbefund bei der Kontrolle: EINE der Kalender-Warnungen (31.07.) lag bereits im
-- echten admin@-Postfach und wurde trotzdem nicht bearbeitet. Die Zustellung war also nicht
-- das einzige Problem -- auch im gelesenen Postfach ging sie unter (siehe Task-Listen-Befund:
-- 1729 offene Dispatch-Aufgaben, Anzeige zeigte 10).
--
-- ROLLBACK: die geschlossenen sind ueber erledigt_am identifizierbar, die umgehaengten
-- ueber (zugewiesen_an = <ziel> AND updated_at im Migrationsfenster).

-- Teil 1: schliessen
update public.tasks t
   set status = 'erledigt', erledigt_am = now()
  from public.profiles p
 where p.id = t.zugewiesen_an
   and t.status <> 'erledigt'
   and (p.email ilike '%test%' or p.email ilike '%smoke%' or p.email ilike '%bkat%')
   and (
        t.titel like 'Async-Op gescheitert%'
     or t.titel like 'Partner aktivieren:%'
     or exists (select 1 from public.claims c where c.id = t.claim_id and c.operative_status = 'storniert')
     or exists (select 1 from public.claim_parties cp
                  join public.personen pe on pe.id = cp.person_id
                 where cp.claim_id = t.claim_id
                   and (pe.email ilike any (array['%smoke%','%throwaway%','%claimondo.test%'])
                        or pe.vorname ilike any (array['%smoke%','%test%'])))
   );

-- Teil 2a: SV-Kalender-Warnungen an den echten Admin
update public.tasks t
   set zugewiesen_an = (select id from public.profiles where email = 'admin@claimondo.de')
  from public.profiles p
 where p.id = t.zugewiesen_an
   and t.status <> 'erledigt'
   and (p.email ilike '%test%' or p.email ilike '%smoke%' or p.email ilike '%bkat%')
   and t.titel like '%Kalender-Verbindung%'
   and (select id from public.profiles where email = 'admin@claimondo.de') is not null;

-- Teil 2b: verbleibende (VS-Meldungen) an das echte Dispatch-Postfach
update public.tasks t
   set zugewiesen_an = (select id from public.profiles where email = 'dispatch@claimondo.de')
  from public.profiles p
 where p.id = t.zugewiesen_an
   and t.status <> 'erledigt'
   and (p.email ilike '%test%' or p.email ilike '%smoke%' or p.email ilike '%bkat%')
   and (select id from public.profiles where email = 'dispatch@claimondo.de') is not null;
