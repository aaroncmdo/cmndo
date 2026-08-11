-- Partner-Cockpit: inkrementelle System-Events (vertrag + lead_zugewiesen) via DB-Trigger.
--
-- WARUM TRIGGER statt logPartnerEvent-Calls im App-Code:
-- Diese beiden Momente haben KEINEN Choke-Point. `vertrag_unterschrieben` wird an 9 Stellen
-- gesetzt (Willkommen, gutachter/vertrag, Akademie, Buero, Basic-Wizard-finalize,
-- sv-onboarding-actions, Stripe-Webhook 3x), `claims.sv_id` an ~17. Ein Trigger deckt ALLE
-- Pfade ab (auch den Webhook), feuert exakt 1x pro echtem Spalten-Uebergang (kein
-- Doppel-Logging bei verketteten Pfaden) und fasst keinen TS-Code an.
-- Die 4 bestehenden Events (freigeschaltet/gesperrt/verifiziert) bleiben app-seitig via
-- logPartnerEvent -- die sitzen an genau einem Admin-Choke-Point, dort ist App-Code richtig.
--
-- NICHT-FATAL: beide Funktionen kapseln den INSERT in EXCEPTION WHEN OTHERS -> ein Fehler
-- im Aktivitaets-Log darf einen Vertrags-Abschluss / eine Fall-Zuweisung NIE zurueckrollen
-- (gleiche Garantie wie logPartnerEvent's try/catch).

-- 1) SV-Vertrag unterschrieben --------------------------------------------------------
create or replace function public.log_sv_vertrag_aktivitaet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.partner_aktivitaeten (partner_typ, partner_id, typ, text, meta, ist_system)
    values ('sv', new.id, 'vertrag', 'Vertrag unterschrieben',
            jsonb_build_object('quelle', 'db_trigger'), true);
  exception when others then
    raise warning '[log_sv_vertrag_aktivitaet] insert failed (non-fatal): %', sqlerrm;
  end;
  return null;
end;
$$;

-- Nur UPDATE (kein INSERT): ein SV, der bereits mit vertrag_unterschrieben=true angelegt
-- wird, ist Seed-/Testdaten -- der echte Business-Moment ist der Uebergang false->true.
drop trigger if exists trg_sv_vertrag_aktivitaet on public.sachverstaendige;
create trigger trg_sv_vertrag_aktivitaet
  after update of vertrag_unterschrieben on public.sachverstaendige
  for each row
  when (new.vertrag_unterschrieben is true
        and old.vertrag_unterschrieben is distinct from new.vertrag_unterschrieben)
  execute function public.log_sv_vertrag_aktivitaet();

-- 2) Fall/Lead einem SV zugewiesen ----------------------------------------------------
create or replace function public.log_sv_lead_zuweisung_aktivitaet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.partner_aktivitaeten (partner_typ, partner_id, typ, text, meta, ist_system)
    values ('sv', new.sv_id, 'lead_zugewiesen',
            'Fall zugewiesen: ' || coalesce(new.claim_nummer, new.id::text),
            jsonb_build_object('claim_id', new.id, 'claim_nummer', new.claim_nummer,
                               'quelle', 'db_trigger'),
            true);
  exception when others then
    raise warning '[log_sv_lead_zuweisung_aktivitaet] insert failed (non-fatal): %', sqlerrm;
  end;
  return null;
end;
$$;

-- INSERT + UPDATE: convert-lead-to-claim legt den Claim bereits MIT sv_id an (echter
-- Zuweisungs-Moment), spaetere Zuweisung/Umverteilung laeuft per UPDATE.
-- Zwei Trigger statt einem, weil eine WHEN-Klausel auf INSERT kein OLD referenzieren darf.
drop trigger if exists trg_claim_sv_zuweisung_ins on public.claims;
create trigger trg_claim_sv_zuweisung_ins
  after insert on public.claims
  for each row
  when (new.sv_id is not null)
  execute function public.log_sv_lead_zuweisung_aktivitaet();

drop trigger if exists trg_claim_sv_zuweisung_upd on public.claims;
create trigger trg_claim_sv_zuweisung_upd
  after update of sv_id on public.claims
  for each row
  when (new.sv_id is not null and old.sv_id is distinct from new.sv_id)
  execute function public.log_sv_lead_zuweisung_aktivitaet();
