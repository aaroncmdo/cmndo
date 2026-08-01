alter table public.sv_onboarding_rechnungen
  drop constraint sv_onboarding_rechnungen_typ_check,
  add  constraint sv_onboarding_rechnungen_typ_check
       check (typ in ('solo','buero','akademie','netzwerk_einrichtung'));