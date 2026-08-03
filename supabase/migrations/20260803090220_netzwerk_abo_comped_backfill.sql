-- P5 T7 (AB5-Go Aaron 03.08.): Grandfather — alle aktiven, nicht-geloeschten SVs werden
-- comped Netzwerkpartner. comped = dauerhaft aktiv ohne gueltig_bis (P0 istAktivesAbo:
-- comped => true). Idempotent: ON CONFLICT (sv_id) DO NOTHING (P0 sv_netzwerk_abo_sv_uniq).
-- K3: paket wird NICHT angefasst. Delta zum Apply-Zeitpunkt: 2 aktive SVs ohne Abo-Row
-- (9 waren bereits via P2-Backfill comped).
insert into public.sv_netzwerk_abonnements (sv_id, status)
select id, 'comped'
  from public.sachverstaendige
 where ist_aktiv = true and geloescht_am is null
on conflict (sv_id) do nothing;