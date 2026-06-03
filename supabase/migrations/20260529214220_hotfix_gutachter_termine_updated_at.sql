-- Live-Drift: Code schreibt gutachter_termine.updated_at, Spalte fehlte.
alter table public.gutachter_termine
  add column if not exists updated_at timestamptz not null default now();

-- Trigger zur Pflege, konsistent mit den ~23 anderen Tabellen im Projekt.
drop trigger if exists set_gutachter_termine_updated_at on public.gutachter_termine;
create trigger set_gutachter_termine_updated_at
  before update on public.gutachter_termine
  for each row execute function public.set_updated_at_now();
