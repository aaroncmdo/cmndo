-- KI-Task-Executor Audit-Spine (P0): protokolliert jede KI-Ausfuehrung einer
-- Aufgabe (Plan + Status + wer-gestartet/-bestaetigt + Fehler). Analog
-- ai_claim_proposals: RLS an + kein anon/authenticated-Grant -> nur service_role
-- (Admin-Surface schreibt/liest via createAdminClient nach requireRole-Guard).
-- Partial-Unique-Index = Idempotenz (max. eine offene Ausfuehrung je Task).
create table public.ai_task_executions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  claim_id uuid references public.claims(id) on delete cascade,
  typ text,
  status text not null default 'geplant'
    check (status in ('geplant','warte_bestaetigung','ausgefuehrt','abgebrochen','fehler')),
  plan jsonb not null default '[]'::jsonb,
  begruendung text,
  modell text not null,
  gestartet_von uuid references auth.users(id),
  bestaetigt_von uuid references auth.users(id),
  erstellt_am timestamptz not null default now(),
  abgeschlossen_am timestamptz,
  fehler text
);
create index ai_task_executions_task_idx on public.ai_task_executions(task_id);
create index ai_task_executions_claim_idx on public.ai_task_executions(claim_id);
create unique index ai_task_executions_offen_idx
  on public.ai_task_executions(task_id) where status in ('geplant','warte_bestaetigung');
alter table public.ai_task_executions enable row level security;
revoke all on public.ai_task_executions from anon, authenticated;
