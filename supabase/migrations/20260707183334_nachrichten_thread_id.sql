-- Phase 1: additive FK-Spalte thread_id auf nachrichten (kein RLS-Change, altes UI laeuft weiter)
alter table public.nachrichten
  add column if not exists thread_id uuid references public.chat_threads(id) on delete set null;
create index if not exists idx_nachrichten_thread on public.nachrichten (thread_id, created_at desc);
