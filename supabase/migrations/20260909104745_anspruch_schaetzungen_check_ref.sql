-- Nachtraegliche Verknuepfung Foto-Check <-> Lead (Aaron 09.09.2026, Design
-- docs/superpowers/specs/2026-09-09-foto-check-nachtraegliche-verknuepfung-design.md).
-- claimondo.de/check legt eine Browser-Kennung (Cookie claimondo_check_ref, UUID v4, 30 Tage) an und
-- haengt sie als ?ref= an den Foto-CTA; das Tool speichert sie hier. Sendet der Interessent spaeter den
-- Kontakt ab, haengt submitCheckLead alle Sessions mit dieser ref und lead_id IS NULL an den neuen Lead.
-- Additiv, nullable: alter Code laeuft unveraendert; der Cleanup-Cron loescht weiterhin nur lead_id IS NULL.
alter table public.anspruch_schaetzungen
  add column if not exists check_ref uuid;

create index if not exists anspruch_schaetzungen_check_ref_idx
  on public.anspruch_schaetzungen (check_ref)
  where check_ref is not null;

comment on column public.anspruch_schaetzungen.check_ref is
  'Browser-Kennung aus claimondo.de/check (Cookie claimondo_check_ref, 30 Tage). Verknuepft Foto-Check-Sessions, die VOR dem Kontakt entstanden, nachtraeglich mit dem Lead (2026-09-09).';
