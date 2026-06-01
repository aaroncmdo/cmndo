-- W1.2 / AAR-946: referenzielle Integritaet fuer abrechnungen.empfaenger via Trigger-Guard.
-- empfaenger_id ist polymorph: typ='sv' -> sachverstaendige.id ODER organisationen.id
-- (Sammelrechnung); typ in (marketing,kanzlei) -> NULL (email-keyed, Maik/LexDrive);
-- typ='makler' -> noch kein Writer (Ziel-Tabelle definiert W2.1/AAR-949). Kein FK
-- moeglich (Multi-Target) -> BEFORE INSERT/UPDATE Trigger-Guard (Codebase-Pattern guard_*).

-- 1) SMOKE-Altlasten entfernen (3 Zeilen vom 2026-05-08, abrechnungs_nr LIKE 'SMOKE-%',
--    0 Child-Refs in abrechnung_positionen/makler_provisionen/embed_abrechnung_positionen).
--    Auf einer frischen/Preview-DB ein No-op.
delete from public.abrechnungen where abrechnungs_nr like 'SMOKE-%';

-- 2) Validierungs-Funktion
create or replace function public.guard_abrechnungen_empfaenger()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  if new.empfaenger_typ = 'sv' then
    if new.empfaenger_id is null then
      raise exception 'abrechnungen: empfaenger_id darf bei empfaenger_typ=sv nicht NULL sein';
    end if;
    if not exists (select 1 from sachverstaendige s where s.id = new.empfaenger_id)
       and not exists (select 1 from organisationen o where o.id = new.empfaenger_id) then
      raise exception 'abrechnungen: empfaenger_id % (typ=sv) zeigt weder auf sachverstaendige noch organisationen', new.empfaenger_id;
    end if;
  elsif new.empfaenger_typ = 'makler' then
    if new.empfaenger_id is null then
      raise exception 'abrechnungen: empfaenger_id darf bei empfaenger_typ=makler nicht NULL sein';
    end if;
  end if;
  -- marketing/kanzlei: email-keyed, empfaenger_id NULL erlaubt (empfaenger_email ist NOT NULL auf Spaltenebene).
  return new;
end;
$func$;

-- 3) Trigger
drop trigger if exists trg_guard_abrechnungen_empfaenger on public.abrechnungen;
create trigger trg_guard_abrechnungen_empfaenger
  before insert or update on public.abrechnungen
  for each row execute function public.guard_abrechnungen_empfaenger();
