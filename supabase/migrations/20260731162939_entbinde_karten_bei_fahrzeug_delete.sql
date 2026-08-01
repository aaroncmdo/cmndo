create or replace function public.entbinde_karten_bei_fahrzeug_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fahrzeug wird geloescht -> gebundene Netzwerkkarten sauber entbinden (statt Zombie via FK-SET-NULL:
  -- schadenkarten_fahrzeug_id_fkey ist ON DELETE SET NULL, status bliebe 'gebunden' = tote Karte).
  -- Semantik = entbindeSchadenkarte (status='frei'). Reused Enum 'frei' -> kein CHECK/flag-drift-Change.
  update public.schadenkarten
     set status = 'frei', fahrzeug_id = null, gebunden_am = null, gebunden_von = null
   where fahrzeug_id = old.id and status = 'gebunden';
  return old;
end;
$$;

drop trigger if exists trg_entbinde_karten_bei_fahrzeug_delete on public.vehicles;
create trigger trg_entbinde_karten_bei_fahrzeug_delete
  before delete on public.vehicles
  for each row execute function public.entbinde_karten_bei_fahrzeug_delete();