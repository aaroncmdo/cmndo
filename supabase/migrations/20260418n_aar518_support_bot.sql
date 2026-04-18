-- AAR-518 (S1): Support-Bot Backend — Rate-Limit + Ticket-Log
--
-- support_rate_limits: pro User+Stunde Counter, 10/h Default-Limit.
-- support_ticket_log:  Audit-Log aller Bot-Interaktionen (new/comment/no_action).
--   linear_issue_id ist nullable, damit "no_action"-Turns (z.B. reine
--   Rueckfragen ohne Ticket) trotzdem geloggt werden koennen.
--
-- RLS:
--   - Nutzer sehen eigene Log-Zeilen (SELECT auf support_ticket_log).
--   - Admin + Kundenbetreuer sehen alles (beide Tabellen).
--   - Writes laufen ausschliesslich ueber Service-Role (kein INSERT-Policy).

CREATE TABLE IF NOT EXISTS public.support_rate_limits (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hour_bucket timestamptz NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, hour_bucket)
);

ALTER TABLE public.support_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_rl_admin_read" ON public.support_rate_limits
  FOR SELECT USING (
    (SELECT rolle FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'kundenbetreuer')
  );

CREATE TABLE IF NOT EXISTS public.support_ticket_log (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linear_issue_id text,
  action_type     text NOT NULL DEFAULT 'new',
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

CREATE POLICY "support_log_own" ON public.support_ticket_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "support_log_admin_read" ON public.support_ticket_log
  FOR SELECT USING (
    (SELECT rolle FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'kundenbetreuer')
  );
