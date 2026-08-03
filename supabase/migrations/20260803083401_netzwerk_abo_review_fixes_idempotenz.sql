-- P5 Review-Fix I-1: Die §14-Einrichtungsrechnung ist EINMALIG pro SV — der bestehende
-- Dedup-Index (stripe_session_uniq) ist partiell auf stripe_session_id IS NOT NULL und
-- greift fuer netzwerk_einrichtung (session-los, Webhook-getrieben) NICHT. Harter
-- Race-freier Schutz gegen Doppel-Rechnung beim Webhook-Reprocess:
create unique index if not exists sv_onboarding_rechnungen_netzwerk_einrichtung_uniq
  on public.sv_onboarding_rechnungen (sv_id)
  where typ = 'netzwerk_einrichtung';

-- P5 Review-Fix I-3: Dunning-Uhr darf nicht auf aktualisiert_am laufen (jedes Stripe-
-- Smart-Retry-payment_failed resettet sie). Dedizierter Anker, nur beim ECHTEN Uebergang
-- pending/aktiv -> ueberfaellig gesetzt (Webhook), bei aktiv/gekuendigt genullt.
alter table public.sv_netzwerk_abonnements
  add column if not exists ueberfaellig_seit timestamptz;
comment on column public.sv_netzwerk_abonnements.ueberfaellig_seit is
  'Zeitpunkt des Eintritts in status=ueberfaellig (Dunning-Anker; Stripe-Retries resetten ihn NICHT).';