-- AAR-915: Rate-Limit für öffentliches Gutachter-Finder-Formular
--
-- Hintergrund: `gutachter_finder_anfragen.gfa_insert_public` ist eine RLS-Policy
-- mit `WITH CHECK (true)` — gewollt, weil das Formular ohne Login posten muss.
-- Aktuell kann jeder anon-Client beliebig viele Einträge erzeugen → Spam-/Flood-Risiko.
--
-- Strategie: App-Layer-Rate-Limit. Server-Action `saveOnboardingStep` ruft
-- vor jedem INSERT die SECURITY-DEFINER-Function `check_gfa_rate_limit(ip_hash)`
-- auf. Function prüft Sliding-Window (1h) + INSERTet einen Audit-Eintrag.
-- Bei > N Anfragen → liefert false → Server-Action returnt Rate-Limit-Fehler.
--
-- Warum App-Layer und nicht RLS-Policy:
--   - RLS hat keinen direkten Zugriff auf request.headers (IP) ohne PostgREST-Hack
--   - Server-Action kennt IP via Next.js headers() — sauberer Trace
--   - SECURITY DEFINER Function bündelt Read+Write in einem atomaren Schritt
--   - Memory `feedback_supabase_connections` warnt vor Connection-Heavy-Patterns

-- Audit-Tabelle: nur ip_hash + timestamp, kein Klartext-IP (DSGVO)
CREATE TABLE IF NOT EXISTS public.gfa_rate_limit (
  id         bigserial PRIMARY KEY,
  ip_hash    text      NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gfa_rate_limit_ip_hash_created_at
  ON public.gfa_rate_limit (ip_hash, created_at DESC);

-- Auto-cleanup: nur Einträge der letzten 24h behalten (für Sliding-Window 1h reicht)
-- läuft nicht als Cron, sondern lazy bei jedem Function-Call

ALTER TABLE public.gfa_rate_limit ENABLE ROW LEVEL SECURITY;

-- Niemand außer service_role kommt direkt an die Tabelle
DROP POLICY IF EXISTS gfa_rate_limit_service_only ON public.gfa_rate_limit;
CREATE POLICY gfa_rate_limit_service_only
  ON public.gfa_rate_limit
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.gfa_rate_limit FROM anon, authenticated, PUBLIC;

-- Check + Insert in einem atomaren Schritt. Limit: max 5 Einträge in 1 Stunde
-- pro IP-Hash. Returnt true wenn unter Limit (und INSERTet den neuen Eintrag),
-- false wenn übers Limit (und INSERTet NICHT — Rate-Limit greift sofort).
CREATE OR REPLACE FUNCTION public.check_gfa_rate_limit(p_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_count integer;
  v_limit constant integer := 5;
  v_window constant interval := '1 hour';
BEGIN
  IF p_ip_hash IS NULL OR length(p_ip_hash) < 8 THEN
    -- ohne IP-Hash kein Rate-Limit möglich, prophylaktisch deny
    RETURN false;
  END IF;

  -- Lazy-Cleanup: alte Einträge entfernen (> 24h)
  DELETE FROM public.gfa_rate_limit
  WHERE created_at < now() - interval '24 hours';

  -- Count im Sliding-Window
  SELECT count(*) INTO v_count
  FROM public.gfa_rate_limit
  WHERE ip_hash = p_ip_hash
    AND created_at >= now() - v_window;

  IF v_count >= v_limit THEN
    RETURN false;
  END IF;

  -- Eintrag schreiben + true returnen
  INSERT INTO public.gfa_rate_limit (ip_hash) VALUES (p_ip_hash);
  RETURN true;
END;
$$;

-- Nur Server-Side aufrufbar via service_role oder authenticated-Server-Action
REVOKE ALL ON FUNCTION public.check_gfa_rate_limit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_gfa_rate_limit(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_gfa_rate_limit(text) IS
  'AAR-915 — Sliding-Window-Rate-Limit (5 Anfragen / 1h) für anonyme Gutachter-Finder-Anfragen. Wird von saveOnboardingStep aufgerufen.';
COMMENT ON TABLE public.gfa_rate_limit IS
  'AAR-915 — Audit-Trail für Rate-Limit (nur IP-Hash, kein Klartext). Lazy-Cleanup nach 24h.';
