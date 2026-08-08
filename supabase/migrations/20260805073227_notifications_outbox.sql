-- C3a Fundament (Notification-Outbox): durable Outbox fuer System-2/3-Sends.
-- enqueue() schreibt (dedup_key UNIQUE + ON CONFLICT DO NOTHING), der bestehende
-- */5min-Worker (/api/notifications/process) drant. service_role-only: RLS an,
-- keine Policy, kein Grant -> anon/authenticated bekommen nichts, admin-Client bypasst RLS.
-- Getrackte Version: 20260805073227 (via Supabase-Plugin apply_migration, Regel 2).

CREATE TABLE public.notifications_outbox (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key          text NOT NULL UNIQUE,
  kanal              text NOT NULL CHECK (kanal IN ('whatsapp','email','sms','in_app')),
  template           text NOT NULL,
  claim_id           uuid REFERENCES public.claims(id) ON DELETE CASCADE,
  empfaenger_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  empfaenger_rolle   text,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  versuche           integer NOT NULL DEFAULT 0,
  next_retry_at      timestamptz,
  fehler             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  sent_at            timestamptz
);

-- Worker-Claim-Index: nur die reclaimbaren Zeilen (pending/failed/abgelaufenes sending).
CREATE INDEX idx_notifications_outbox_claimable
  ON public.notifications_outbox (status, next_retry_at)
  WHERE status IN ('pending','sending','failed');

-- service_role-only: RLS an, keine Policy (anon/authenticated bekommen nichts;
-- der admin-Client bypasst RLS). Kein Grant noetig -> Reachability-Ratchets unberuehrt.
ALTER TABLE public.notifications_outbox ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.notifications_outbox IS
  'C3a Fundament: durable Outbox fuer System-2/3-Sends. enqueue() schreibt, der */5min-Worker drant. dedup_key UNIQUE = strukturelle Doppel-Send-Bremse.';
