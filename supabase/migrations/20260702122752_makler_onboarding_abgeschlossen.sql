-- Makler-Aktivierungs-Onboarding: Flag um den Erst-Login-Wizard genau einmal zu zeigen.
-- Additiv, default false (Bestands-Makler = kein Wizard-Zwang; sie sind eh schon aktiv).
alter table public.makler add column if not exists onboarding_abgeschlossen boolean not null default false;
