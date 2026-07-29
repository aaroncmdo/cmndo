-- P2-Vorbedingung (Aaron-Entscheid „Bestand comped + P2"): die aktuellen Top-Partner
-- (paket pro/standard = die mit Badge+Boost heute) werden als Netzwerkpartner gecomped,
-- damit der paket->abo-Boost-Swap non-regressiv ist. basic/frei bleibt non-partner (rankt unten).
-- Idempotent via unique(sv_id). Grandfather-Snapshot des aktuellen Bestands (Stand: 9 SVs).
insert into public.sv_netzwerk_abonnements (sv_id, status)
select s.id, 'comped'
from public.sachverstaendige s
where s.paket is not null and s.paket <> '' and s.paket <> 'basic'
on conflict (sv_id) do nothing;
