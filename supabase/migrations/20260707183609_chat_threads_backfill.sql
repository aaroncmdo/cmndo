-- Phase 1 Backfill: 165 Nachrichten idempotent auf Threads. Verwaiste fall_ids + stale user-ids raus.
-- Ergebnis (verifiziert): 14 kunde_gruppe-Threads, 0 direkt, 15 Nachrichten gemappt, 19 Teilnehmer.

-- 1) kunde_gruppe-Thread je Claim mit gruppenchat- ODER whatsapp-Nachrichten
insert into public.chat_threads (claim_id, art)
select distinct n.fall_id, 'kunde_gruppe'
from public.nachrichten n
join public.claims c on c.id = n.fall_id
where n.kanal in ('gruppenchat','whatsapp')
on conflict do nothing;

-- 2) kunde_gruppe-Teilnehmer: Kunde + KB + SV (non-null, in auth.users vorhanden)
insert into public.chat_thread_teilnehmer (thread_id, user_id, rolle)
select th.id, u.uid, u.rolle
from public.chat_threads th
join public.claims c on c.id = th.claim_id
cross join lateral (values
  (c.geschaedigter_user_id, 'kunde'),
  (c.kundenbetreuer_id, 'kundenbetreuer'),
  (c.sv_id, 'sachverstaendiger')
) as u(uid, rolle)
where th.art = 'kunde_gruppe' and u.uid is not null
  and exists (select 1 from auth.users au where au.id = u.uid)
on conflict (thread_id, user_id) do nothing;

-- 3) gruppenchat -> kunde_gruppe-Thread
update public.nachrichten n
set thread_id = th.id
from public.chat_threads th
where th.claim_id = n.fall_id and th.art = 'kunde_gruppe'
  and n.kanal = 'gruppenchat' and n.thread_id is null;

-- 4a) direkt(Kunde,KB)-Thread fuer whatsapp-Claims mit beiden (existierenden) user-ids
insert into public.chat_threads (claim_id, art, direkt_user_a, direkt_user_b)
select distinct c.id, 'direkt',
  least(c.geschaedigter_user_id, c.kundenbetreuer_id),
  greatest(c.geschaedigter_user_id, c.kundenbetreuer_id)
from public.nachrichten n
join public.claims c on c.id = n.fall_id
where n.kanal = 'whatsapp'
  and c.geschaedigter_user_id is not null and c.kundenbetreuer_id is not null
  and c.geschaedigter_user_id <> c.kundenbetreuer_id
  and exists (select 1 from auth.users where id = c.geschaedigter_user_id)
  and exists (select 1 from auth.users where id = c.kundenbetreuer_id)
on conflict do nothing;

-- 4b) direkt-Teilnehmer (in auth.users vorhanden)
insert into public.chat_thread_teilnehmer (thread_id, user_id, rolle)
select th.id, u.uid, u.rolle
from public.chat_threads th
join public.claims c on c.id = th.claim_id
cross join lateral (values
  (th.direkt_user_a, case when th.direkt_user_a = c.geschaedigter_user_id then 'kunde' else 'kundenbetreuer' end),
  (th.direkt_user_b, case when th.direkt_user_b = c.geschaedigter_user_id then 'kunde' else 'kundenbetreuer' end)
) as u(uid, rolle)
where th.art = 'direkt'
  and exists (select 1 from auth.users au where au.id = u.uid)
on conflict (thread_id, user_id) do nothing;

-- 4c) whatsapp -> direkt-Thread (wenn vorhanden)
update public.nachrichten n
set thread_id = th.id
from public.claims c
join public.chat_threads th on th.claim_id = c.id and th.art = 'direkt'
  and th.direkt_user_a = least(c.geschaedigter_user_id, c.kundenbetreuer_id)
  and th.direkt_user_b = greatest(c.geschaedigter_user_id, c.kundenbetreuer_id)
where c.id = n.fall_id and n.kanal = 'whatsapp' and n.thread_id is null;

-- 4d) whatsapp-Rest (kein direkt moeglich) -> kunde_gruppe
update public.nachrichten n
set thread_id = th.id
from public.chat_threads th
where th.claim_id = n.fall_id and th.art = 'kunde_gruppe'
  and n.kanal = 'whatsapp' and n.thread_id is null;
