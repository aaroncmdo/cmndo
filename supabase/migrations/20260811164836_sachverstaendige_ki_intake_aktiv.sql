alter table public.sachverstaendige
  add column if not exists ki_intake_aktiv boolean not null default false;
comment on column public.sachverstaendige.ki_intake_aktiv is
  'KI-gefuehrtes /flow-Intake fuer die Kunden dieses SV aktiv (Rollout-Gate, Default false).';
