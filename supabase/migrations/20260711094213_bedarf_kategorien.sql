alter table public.claims
  add column if not exists bedarf_kategorien text[],
  add column if not exists bedarf_quelle text,
  add column if not exists bedarf_confidence int2,
  add column if not exists bedarf_ermittelt_am timestamptz;

alter table public.leads
  add column if not exists bedarf_kategorien text[],
  add column if not exists bedarf_quelle text,
  add column if not exists bedarf_confidence int2,
  add column if not exists bedarf_ermittelt_am timestamptz;

comment on column public.claims.bedarf_kategorien is 'Abgeleiteter Reparatur-Bedarf (Gewerke) fuer Werkstatt-Qualifizierung; Quelle in bedarf_quelle';
comment on column public.leads.bedarf_kategorien is 'Abgeleiteter Reparatur-Bedarf (Gewerke) fuer Werkstatt-Qualifizierung; Quelle in bedarf_quelle';
