-- Intent (immer) + operativer Vermittlungs-Status, symmetrisch auf leads + claims.
alter table public.leads
  add column if not exists reparaturwunsch text
    check (reparaturwunsch is null or reparaturwunsch in ('reparatur','fiktiv','unentschieden')),
  add column if not exists reparatur_vermittlung_status text not null default 'offen'
    check (reparatur_vermittlung_status in ('offen','eigene','vermittelt','abgelehnt')),
  add column if not exists reparatur_werkstatt_extern text;

alter table public.claims
  add column if not exists reparaturwunsch text
    check (reparaturwunsch is null or reparaturwunsch in ('reparatur','fiktiv','unentschieden')),
  add column if not exists reparatur_vermittlung_status text not null default 'offen'
    check (reparatur_vermittlung_status in ('offen','eigene','vermittelt','abgelehnt')),
  add column if not exists reparatur_werkstatt_extern text;

-- quelle um gutachter/kb erweitern (bestehender CHECK aus 20260628215921 droppen + neu).
alter table public.leads  drop constraint if exists leads_reparatur_werkstatt_quelle_check;
alter table public.claims drop constraint if exists claims_reparatur_werkstatt_quelle_check;
alter table public.leads  add constraint leads_reparatur_werkstatt_quelle_check
  check (reparatur_werkstatt_quelle is null or reparatur_werkstatt_quelle in ('dispatcher','kunde','embed','gutachter','kb'));
alter table public.claims add constraint claims_reparatur_werkstatt_quelle_check
  check (reparatur_werkstatt_quelle is null or reparatur_werkstatt_quelle in ('dispatcher','kunde','embed','gutachter','kb'));
