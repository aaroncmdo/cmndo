-- AAR-518 (S1): Support-Bot Backend — Rate-Limit + Audit-Log
-- Parent: AAR-517 (Support-Ticket-AI-Widget)

-- Rate-Limit-Tracking per User + Stunde
CREATE TABLE IF NOT EXISTS public.support_rate_limits (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hour_bucket timestamptz NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, hour_bucket)
);

ALTER TABLE public.support_rate_limits ENABLE ROW LEVEL SECURITY;

-- Admin/KB darf Rate-Limits lesen (Debug)
CREATE POLICY "support_rl_admin_read" ON public.support_rate_limits
  FOR SELECT USING (
    (SELECT rolle FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'kundenbetreuer')
  );

-- Writes nur über Service-Role (kein Policy nötig — fehlen = deny für authenticated)

-- Audit-Log: AI-Support-Aktionen pro User
CREATE TABLE IF NOT EXISTS public.support_ticket_log (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linear_issue_id text,                        -- z.B. "AAR-550" — NULL wenn action_type='no_action'
  action_type     text NOT NULL DEFAULT 'new', -- 'new' | 'comment' | 'no_action'
  page_url        text,
  turn_count      integer NOT NULL DEFAULT 1,
  has_screenshot  boolean NOT NULL DEFAULT false,
  has_voice       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_log_action_type_check
    CHECK (action_type IN ('new', 'comment', 'no_action'))
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_log_user_created
  ON public.support_ticket_log (user_id, created_at DESC);

ALTER TABLE public.support_ticket_log ENABLE ROW LEVEL SECURITY;

-- User sieht eigene Logs
CREATE POLICY "support_log_own" ON public.support_ticket_log
  FOR SELECT USING (auth.uid() = user_id);

-- Admin + KB sehen alles
CREATE POLICY "support_log_admin_read" ON public.support_ticket_log
  FOR SELECT USING (
    (SELECT rolle FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'kundenbetreuer')
  );

COMMENT ON TABLE public.support_rate_limits IS
  'AAR-518: Rate-Limit-Counter pro User/Stunde für /api/support/chat. Service-Role-only Writes.';
COMMENT ON TABLE public.support_ticket_log IS
  'AAR-518: Audit-Log aller AI-Support-Aktionen (neues Ticket, Kommentar, kein Action). action_type=new|comment|no_action.';
COMMENT ON COLUMN public.support_ticket_log.action_type IS
  'AAR-518 Nachtrag: Unterscheidet Duplikat-Kommentar vs. neues Ticket vs. "Bug war schon gemeldet, nichts getan".';;
