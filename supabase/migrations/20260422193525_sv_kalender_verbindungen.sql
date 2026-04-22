-- AAR-717: Multi-Provider-Kalender-Verbindungen.
--
-- Zusätzlich zum Google-Calendar-OAuth-Flow (AAR-242, Tokens auf profiles)
-- können SVs sich jetzt auch per CalDAV (Apple iCloud, Fastmail, Nextcloud
-- oder Custom-Server) verbinden. Credentials werden AES-256-GCM-verschlüsselt
-- mit CALDAV_ENCRYPTION_KEY-Env.
--
-- Google-Tokens bleiben vorerst auf profiles — separate Migration (später)
-- zieht sie in diese Tabelle um. Bis dahin prüft findBestSV beide Quellen.
--
-- Scope (dieses Ticket): Read-only. Der Dispatch liest Free-Busy-Events, wir
-- schreiben keine Claimondo-Termine in den privaten Kalender. Write-Support
-- ist AAR-716.

CREATE TABLE IF NOT EXISTS public.sv_kalender_verbindungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id uuid NOT NULL REFERENCES public.sachverstaendige(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('caldav', 'outlook')),
  -- CalDAV-spezifisch
  server_url text NOT NULL,
  username text NOT NULL,
  password_encrypted text NOT NULL,
  calendar_url text,
  calendar_display_name text,
  -- Provider-Label fürs UI (z.B. „Apple iCloud", „Fastmail", „Custom")
  provider_label text,
  -- Lifecycle
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  fehler_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Genau eine aktive Verbindung pro Provider pro SV
  UNIQUE (sv_id, provider)
);

-- Index für findBestSV-Free-Busy-Dispatch (per sv_id nachschlagen)
CREATE INDEX IF NOT EXISTS idx_sv_kalender_verbindungen_sv_id
  ON public.sv_kalender_verbindungen(sv_id);

-- Index für den Healthcheck-Cron (alle mit letztem Fehler vor X Min)
CREATE INDEX IF NOT EXISTS idx_sv_kalender_verbindungen_last_error
  ON public.sv_kalender_verbindungen(last_error_at)
  WHERE last_error IS NOT NULL;

-- RLS aktivieren
ALTER TABLE public.sv_kalender_verbindungen ENABLE ROW LEVEL SECURITY;

-- SV darf seine eigenen Verbindungen lesen/schreiben
CREATE POLICY "SV liest eigene Kalender-Verbindungen"
  ON public.sv_kalender_verbindungen FOR SELECT
  TO authenticated
  USING (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "SV verwaltet eigene Kalender-Verbindungen"
  ON public.sv_kalender_verbindungen FOR ALL
  TO authenticated
  USING (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  )
  WITH CHECK (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  );

-- Admin liest alle (für Fehler-Banner im SV-Detail-Tab)
CREATE POLICY "Admin liest alle Kalender-Verbindungen"
  ON public.sv_kalender_verbindungen FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rolle = 'admin'
    )
  );

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.sv_kalender_verbindungen_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sv_kalender_verbindungen_updated_at
  BEFORE UPDATE ON public.sv_kalender_verbindungen
  FOR EACH ROW
  EXECUTE FUNCTION public.sv_kalender_verbindungen_set_updated_at();

COMMENT ON TABLE public.sv_kalender_verbindungen IS
  'AAR-717: Multi-Provider-Kalender-Verbindungen pro SV (CalDAV/Outlook). '
  'Credentials AES-256-GCM-verschlüsselt. Google-OAuth-Tokens bleiben '
  'vorerst auf profiles — separate Migration zieht sie später um.';
