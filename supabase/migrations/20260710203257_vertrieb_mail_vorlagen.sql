-- Vertrieb-CRM-Konsolidierung P3: DB-getriebene E-Mail-Vorlagen (Vorstellung + Terminbestaetigung).
-- Vollstaendig DB-driven (D5): Vorlagen-Master editierbar ohne Deploy; Composer laedt+merged+sendet.
create table if not exists public.vertrieb_mail_vorlagen (
  id uuid primary key default gen_random_uuid(),
  typ text not null unique check (typ in ('vorstellung','terminbestaetigung')),
  betreff text not null,
  body text not null,
  aktiv boolean not null default true,
  aktualisiert_am timestamptz not null default now()
);

alter table public.vertrieb_mail_vorlagen enable row level security;

-- Nur Staff (admin/dispatch); Zugriff laeuft ohnehin ueber service-role-Actions (RLS = defense in depth).
create policy vertrieb_mail_vorlagen_staff on public.vertrieb_mail_vorlagen
  for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch'))
  );

insert into public.vertrieb_mail_vorlagen (typ, betreff, body) values
  ('vorstellung', 'Zusammenarbeit mit Claimondo — kurze Vorstellung',
   E'Guten Tag {{Ansprechpartner}},\n\nmein Name ist … von Claimondo. Wir vermitteln Kfz-Schadenfälle an qualifizierte Partner in Ihrer Region und würden {{Firma}} gern vorstellen.\n\nHätten Sie kurz Zeit für ein Gespräch?\n\nBeste Grüße'),
  ('terminbestaetigung', 'Terminbestätigung — Ihr Vor-Ort-Termin',
   E'Guten Tag {{Ansprechpartner}},\n\nvielen Dank für das Gespräch. Hiermit bestätigen wir Ihren Vor-Ort-Termin am {{Termin}}.\n\nBeste Grüße')
on conflict (typ) do nothing;
