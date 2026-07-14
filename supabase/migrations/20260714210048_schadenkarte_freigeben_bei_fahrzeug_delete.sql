-- Zombie-Fix: Fahrzeug geloescht -> gebundene Karte freigeben statt als Untote zuruecklassen.
--
-- schadenkarten.fahrzeug_id -> vehicles ON DELETE SET NULL leert die Referenz, laesst status
-- aber auf 'gebunden' stehen. Ergebnis: die Karte ist weder nutzbar (resolveSchadenTokenContext
-- lehnt sie mit 'kein_fahrzeug' ab) noch neu bindbar (bindeSchadenkarteAnFahrzeug verlangt
-- 'bestellt' oder 'frei'). Die physische Karte existiert weiter -> sie gehoert auf 'frei'.
-- Live beobachtet an SKT-N9EAA4Y6MJYYCT3W nach dem Go-Live-Cleanup: trifft echte Flottenkunden
-- genauso, sobald sie ein Fahrzeug loeschen -- die Karte im Auto ist dann still tot.
--
-- BEFORE DELETE (nicht AFTER): laeuft vor dem FK-SET-NULL, sieht fahrzeug_id also noch.
-- SECURITY DEFINER, weil schadenkarten RLS hat und der Loeschende kein UPDATE-Recht darauf
-- haben muss. search_path fixiert -> kein Schema-Hijack.
create or replace function public.schadenkarte_freigeben_bei_fahrzeug_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.schadenkarten
     set status = 'frei',
         fahrzeug_id = null,
         gebunden_am = null,
         gebunden_von = null
   where fahrzeug_id = old.id
     and status = 'gebunden';
  return old;
end $$;

drop trigger if exists trg_schadenkarte_freigeben_bei_fahrzeug_delete on public.vehicles;

create trigger trg_schadenkarte_freigeben_bei_fahrzeug_delete
  before delete on public.vehicles
  for each row
  execute function public.schadenkarte_freigeben_bei_fahrzeug_delete();

-- Einmalige Bereinigung bestehender Zombies (idempotent).
update public.schadenkarten
   set status = 'frei', gebunden_am = null, gebunden_von = null
 where status = 'gebunden'
   and fahrzeug_id is null;
