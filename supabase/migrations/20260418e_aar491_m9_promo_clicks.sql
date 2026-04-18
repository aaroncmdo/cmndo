-- AAR-491 (M9): promo_clicks für Promo-Page Tracking-Stats.
CREATE TABLE IF NOT EXISTS public.promo_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_code_id UUID NOT NULL REFERENCES public.promotion_codes(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  referer TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_promo_clicks_code
  ON public.promo_clicks(promotion_code_id, clicked_at DESC);

ALTER TABLE public.promo_clicks ENABLE ROW LEVEL SECURITY;

-- Makler darf seine eigenen Klicks lesen (join via makler.user_id = auth.uid())
DROP POLICY IF EXISTS "promo_clicks_makler_read" ON public.promo_clicks;
CREATE POLICY "promo_clicks_makler_read" ON public.promo_clicks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.promotion_codes pc
      JOIN public.makler m ON m.id = pc.makler_id
      WHERE pc.id = promo_clicks.promotion_code_id
        AND m.user_id = auth.uid()
    )
  );

-- Admin darf alles lesen
DROP POLICY IF EXISTS "promo_clicks_admin_all" ON public.promo_clicks;
CREATE POLICY "promo_clicks_admin_all" ON public.promo_clicks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rolle = 'admin'
    )
  );

-- Inserts laufen nur über Service-Role (fire-and-forget in Server-Route)
COMMENT ON TABLE public.promo_clicks IS
  'AAR-491: Klicks auf ?p=MK-xxxx Landing-URLs. Insert über Service-Role aus Tracking-Endpoint, keine client-seitigen Inserts.';
