-- Reliability-Sweep: zentrales Dead-Letter fuer kritische async-Operationen
-- (Webhooks, Crons, externe Pushes). Handler rufen recordFailedOperation() im catch ->
-- der recovery-monitor-Cron eskaliert nicht-aufgeloeste Eintraege an einen Admin (kritischer
-- Task). Verhindert die "stiller-Orphan"-Fehlerklasse (Webhook-Strand #3232, 13 Kanzlei-
-- Mandat-Pushes). Auto-Retry pro operation_type ist ein spaeterer Hook; v1 = persist + escalate.
CREATE TABLE IF NOT EXISTS public.failed_async_operations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL,                 -- Routing-Key, z.B. 'stripe_checkout_completed'
  dedup_key     text NOT NULL UNIQUE,           -- stabiler Per-Instance-Key fuer Upsert-Dedup
  entity_type   text,                           -- 'claim' | 'sv' | 'fall' | 'lead' | ...
  entity_id     text,                            -- betroffene Entitaet (fuer Mensch + Recovery)
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error    text,
  status        text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','resolved','escalated')),
  attempts      integer NOT NULL DEFAULT 1,
  escalate_after timestamptz NOT NULL DEFAULT now(),  -- Monitor eskaliert pending-Eintraege ab hier
  escalated_at  timestamptz,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failed_async_ops_open
  ON public.failed_async_operations (status, escalate_after)
  WHERE status = 'pending';

ALTER TABLE public.failed_async_operations ENABLE ROW LEVEL SECURITY;
-- Kein anon/authenticated-Zugriff: nur service-role (bypasst RLS) schreibt/liest.
-- Ein Admin-Read-Policy fuer ein kuenftiges Dashboard kann spaeter ergaenzt werden.

COMMENT ON TABLE public.failed_async_operations IS
  'Reliability-Sweep: Dead-Letter fuer gescheiterte kritische async-Ops; recovery-monitor-Cron eskaliert nicht-aufgeloeste Eintraege an Admin.';
