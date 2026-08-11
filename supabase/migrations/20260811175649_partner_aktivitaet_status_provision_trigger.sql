-- Partner-Cockpit, Teil 2: System-Events 'statuswechsel' + 'provision' via DB-Trigger.
-- Fortsetzung von 20260811171314 (vertrag + lead_zugewiesen); gleiche Begruendung
-- (kein Choke-Point im App-Code) und gleiche Nicht-Fatal-Garantie.

-- ===== 1) statuswechsel: der Partner-eigene Status ====================================
-- Bewusst NUR werkstatt/makler/flotte-Konto. SV hat keine `status`-Spalte -- dort sind
-- sperren/freischalten/verifizieren bereits app-seitig via logPartnerEvent geloggt;
-- ein zusaetzlicher Trigger wuerde dort doppelt loggen.
-- Eine generische Funktion fuer alle drei Tabellen: partner_typ + die ID-Spalte kommen
-- per TG_ARGV, der Wert wird ueber to_jsonb(NEW) dynamisch gelesen (flotte haengt an
-- firmen_flotten_konten.firma_id, nicht an der eigenen id).
create or replace function public.log_partner_status_aktivitaet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner_id uuid;
begin
  begin
    v_partner_id := (to_jsonb(new) ->> tg_argv[1])::uuid;
    if v_partner_id is not null then
      insert into public.partner_aktivitaeten (partner_typ, partner_id, typ, text, meta, ist_system)
      values (tg_argv[0], v_partner_id, 'statuswechsel',
              'Status geändert: ' || coalesce(old.status, '—') || ' → ' || coalesce(new.status, '—'),
              jsonb_build_object('von', old.status, 'nach', new.status, 'quelle', 'db_trigger'),
              true);
    end if;
  exception when others then
    raise warning '[log_partner_status_aktivitaet] insert failed (non-fatal): %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_ws_status_aktivitaet on public.werkstaetten;
create trigger trg_ws_status_aktivitaet
  after update of status on public.werkstaetten
  for each row when (old.status is distinct from new.status)
  execute function public.log_partner_status_aktivitaet('werkstatt', 'id');

drop trigger if exists trg_makler_status_aktivitaet on public.makler;
create trigger trg_makler_status_aktivitaet
  after update of status on public.makler
  for each row when (old.status is distinct from new.status)
  execute function public.log_partner_status_aktivitaet('makler', 'id');

drop trigger if exists trg_flotte_konto_status_aktivitaet on public.firmen_flotten_konten;
create trigger trg_flotte_konto_status_aktivitaet
  after update of status on public.firmen_flotten_konten
  for each row when (old.status is distinct from new.status)
  execute function public.log_partner_status_aktivitaet('flotte', 'firma_id');

-- ===== 2) provision ==================================================================
-- WICHTIG -- Vokabular-Mismatch: partner_provisionen.partner_typ kennt
-- (makler | werkstatt | firmen_flotte | makler_empfehlung), partner_aktivitaeten aber
-- (sv | makler | werkstatt | flotte). Ohne explizites Mapping wuerden 'firmen_flotte'
-- und 'makler_empfehlung' gegen den CHECK laufen -> vom EXCEPTION-Handler geschluckt
-- -> Event verschwindet STILL. Darum die CASE-Uebersetzung.
-- Empirisch verifiziert: bei 'firmen_flotte' zeigt partner_id auf firmen.id (8/8) --
-- exakt die Cockpit-Konvention fuer 'flotte'; bei 'werkstatt' auf werkstaetten.id (8/8).
create or replace function public.log_partner_provision_aktivitaet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_typ text;
  v_betrag text;
begin
  begin
    v_typ := case new.partner_typ
               when 'firmen_flotte' then 'flotte'
               when 'makler_empfehlung' then 'makler'
               else new.partner_typ
             end;
    if v_typ not in ('sv', 'makler', 'werkstatt', 'flotte') then
      return null; -- unbekannter Typ: lieber nichts loggen als still gegen den CHECK laufen
    end if;

    v_betrag := replace(
      to_char(coalesce(new.betrag_brutto, new.betrag_netto_eur, 0), 'FM999999990.00'), '.', ',');

    insert into public.partner_aktivitaeten (partner_typ, partner_id, typ, text, meta, ist_system)
    values (
      v_typ, new.partner_id, 'provision',
      case
        when tg_op = 'INSERT' then 'Provision angelegt: ' || v_betrag || ' €'
             || coalesce(' · ' || new.claim_nummer, '')
        when new.status = 'ausgezahlt' then 'Provision ausgezahlt: ' || v_betrag || ' €'
        when new.status = 'storniert' then 'Provision storniert: ' || v_betrag || ' €'
             || coalesce(' (' || new.storno_grund || ')', '')
        else 'Provision-Status: ' || coalesce(old.status, '—') || ' → ' || coalesce(new.status, '—')
      end,
      jsonb_build_object('provision_id', new.id, 'status', new.status,
                         'betrag_brutto', new.betrag_brutto, 'claim_nummer', new.claim_nummer,
                         'quell_partner_typ', new.partner_typ, 'quelle', 'db_trigger'),
      true);
  exception when others then
    raise warning '[log_partner_provision_aktivitaet] insert failed (non-fatal): %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_provision_aktivitaet_ins on public.partner_provisionen;
create trigger trg_provision_aktivitaet_ins
  after insert on public.partner_provisionen
  for each row when (new.partner_id is not null)
  execute function public.log_partner_provision_aktivitaet();

drop trigger if exists trg_provision_aktivitaet_upd on public.partner_provisionen;
create trigger trg_provision_aktivitaet_upd
  after update of status on public.partner_provisionen
  for each row when (new.partner_id is not null and old.status is distinct from new.status)
  execute function public.log_partner_provision_aktivitaet();
