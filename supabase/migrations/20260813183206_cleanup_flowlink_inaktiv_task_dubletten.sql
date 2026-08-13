-- Ops-Test 13.08.: Bestands-Dubletten des flowlink-inaktiv-Crons schliessen.
--
-- URSACHE (Code-Fix in PR #5261): die Dedupe-Query prueft `.gte('created_at', fourHoursAgo)`
-- statt `.neq('status','erledigt')` -- sie fragte also nur, ob KUERZLICH ein Task angelegt
-- wurde, nicht ob noch einer OFFEN ist. Ein unbearbeiteter Task wurde damit alle 4 Stunden
-- neu erzeugt, der alte blieb daneben stehen.
--
-- BESTAND vor dieser Migration (prod gemessen):
--   1486 offene 'inaktiv_followup'-Tasks auf 101 Leads, Zeitraum 27.07.-13.08.
--   Spitzenreiter: 92 Dubletten fuer EINEN Lead.
--   1486 von 1729 offenen dispatch-Tasks = 86 % -- das Dashboard zeigt die 10 neuesten,
--   also war seit Wochen jede andere Aufgabe unsichtbar (u.a. die Haenger-Tasks aus #5223).
--
-- REGEL: pro Lead bleibt der JUENGSTE offene Task stehen (der Anlass besteht ja fort),
-- alle aelteren werden auf 'erledigt' gesetzt. 101 bleiben, 1385 werden geschlossen.
--
-- SICHERHEIT (alles vorher prod-verifiziert):
--   * alle 1486 stehen auf 'offen' -- keiner in-bearbeitung/blockiert, keiner mit
--     erledigt_am. In 18 Tagen hat niemand einen davon angefasst: es geht keine
--     menschliche Arbeit verloren.
--   * kein Task ohne lead_id (sonst waere die Partition falsch und wuerde zu viel schliessen).
--   * kein Task mit fall_id/claim_id -> der BEFORE-UPDATE-Trigger derive_claim_id_from_fall
--     leitet nichts um.
--   * auf tasks liegen NUR zwei BEFORE-Trigger (claim_id-Ableitung, updated_at) --
--     kein AFTER-Trigger, also keine Benachrichtigungen durch diese 1385 Updates.
--
-- ROLLBACK: die geschlossenen Zeilen sind eindeutig identifizierbar --
--   update public.tasks set status='offen', erledigt_am=null
--    where task_typ='inaktiv_followup' and erledigt_am = (select max(erledigt_am)
--          from public.tasks where task_typ='inaktiv_followup');
--
-- Bewusst ENG: nur task_typ='inaktiv_followup'. Die 195 "Lead unbearbeitet"-Tasks stammen
-- aus einem anderen Cron mit KORREKTEM Dedup (sie sind Smoke-Residue, kein Bug) und werden
-- hier nicht still mitgeaendert.
--
-- ERGEBNIS (verifiziert): 1385 geschlossen, 101 offen (genau 1 je Lead),
-- offene dispatch-Tasks 1729 -> 347.
-- ⚠ Das Sichtbarkeitsziel ist damit NICHT erreicht: die 101 verbliebenen Tasks sind die
-- JUENGSTEN, die Haenger-Tasks aus #5223 liegen zeitlich davor und stehen weiterhin nicht
-- in den 10 Eintraegen, die das Dashboard zeigt. Der Rest ist eine Produktfrage
-- (Sortierung/Arbeitsliste), nicht mehr eine der Datenmenge.

with kandidaten as (
  select id,
         row_number() over (partition by lead_id order by created_at desc, id desc) as rang
    from public.tasks
   where task_typ = 'inaktiv_followup'
     and status = 'offen'
)
update public.tasks t
   set status = 'erledigt',
       erledigt_am = now()
  from kandidaten k
 where t.id = k.id
   and k.rang > 1;
