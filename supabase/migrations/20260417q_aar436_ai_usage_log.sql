-- AAR-436: Token-Monitoring für alle Anthropic-API-Aufrufe.
-- Cache-Hit-Rate = cache_read_input_tokens / (cache_read_input_tokens + cache_creation_input_tokens)
-- gemessen pro endpoint/model/zeitraum.

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id uuid NULL REFERENCES public.faelle(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_endpoint
  ON public.ai_usage_log (created_at DESC, endpoint);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_fall
  ON public.ai_usage_log (fall_id)
  WHERE fall_id IS NOT NULL;

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Service-Role schreibt direkt (Bypass-RLS). Für normale User:
-- nur admin darf lesen.
DROP POLICY IF EXISTS ai_usage_log_admin_read ON public.ai_usage_log;
CREATE POLICY ai_usage_log_admin_read
  ON public.ai_usage_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rolle = 'admin'
    )
  );

-- Write nur via service_role (keine Client-Writes erlaubt).
DROP POLICY IF EXISTS ai_usage_log_no_client_write ON public.ai_usage_log;
CREATE POLICY ai_usage_log_no_client_write
  ON public.ai_usage_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

COMMENT ON TABLE public.ai_usage_log IS 'AAR-436: Token-Usage pro Anthropic-Call inkl. Cache-Hit-Tracking. Writes nur via service_role.';
