-- Werkstatt-QR-Pool: vorgedruckte QR-Codes, die bei der Registrierung einer
-- Werkstatt zugewiesen werden (statt pro Werkstatt einen zu generieren).
-- Admin generiert Batch (status=frei) -> weist Token zu (status=zugewiesen).
-- Inbound /start/werkstatt-qr/<token> loest die zugewiesene Werkstatt auf.
-- Verwaltung admin-only (RLS); Inbound-Resolution server-seitig (Service-Client).

CREATE TABLE public.werkstatt_qr_pool (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL UNIQUE,
  werkstatt_id    uuid REFERENCES public.werkstaetten(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'frei'
                    CHECK (status IN ('frei','zugewiesen','gesperrt')),
  charge          text,
  zugewiesen_am   timestamptz,
  zugewiesen_von  uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid
);

CREATE INDEX werkstatt_qr_pool_werkstatt_id_idx ON public.werkstatt_qr_pool(werkstatt_id);
CREATE INDEX werkstatt_qr_pool_status_idx ON public.werkstatt_qr_pool(status);

ALTER TABLE public.werkstatt_qr_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY werkstatt_qr_pool_admin_all ON public.werkstatt_qr_pool
  FOR ALL TO authenticated
  USING ( is_staff() ) WITH CHECK ( is_staff() );

COMMENT ON TABLE public.werkstatt_qr_pool IS
  'Pool vorgedruckter Werkstatt-QR-Codes. Admin generiert Batch (status=frei), weist bei Registrierung einen Token einer Werkstatt zu (status=zugewiesen). Inbound /start/werkstatt-qr/<token> loest die Werkstatt auf.';
