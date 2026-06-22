-- Werkstatt-Vermittler WP-A Task 2: werkstaetten zur Vermittler-Entitaet erweitern
-- + werkstatt_id auf Survivor (gfa/leads/claims, NIE faelle — CMM-49 droppt faelle)
-- + werkstatt_provisionen (Schema gespiegelt nach makler_provisionen) + RLS.
ALTER TABLE public.werkstaetten
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provision_betrag_netto numeric(10,2) NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS provision_aktiv boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aktiv',
  ADD COLUMN IF NOT EXISTS aktiviert_am timestamptz,
  ADD COLUMN IF NOT EXISTS aktiviert_von uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS gesperrt_am timestamptz,
  ADD COLUMN IF NOT EXISTS gesperrt_grund text,
  ADD COLUMN IF NOT EXISTS bank_iban text,
  ADD COLUMN IF NOT EXISTS bank_bic text,
  ADD COLUMN IF NOT EXISTS bank_kontoinhaber text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='werkstaetten_status_check') THEN
    ALTER TABLE public.werkstaetten ADD CONSTRAINT werkstaetten_status_check CHECK (status IN ('aktiv','gesperrt'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_werkstaetten_user_id ON public.werkstaetten(user_id) WHERE user_id IS NOT NULL;

-- werkstatt_id auf die Survivor-Tabellen (NIE faelle — wird von CMM-49 gedroppt)
ALTER TABLE public.gutachter_finder_anfragen ADD COLUMN IF NOT EXISTS werkstatt_id uuid REFERENCES public.werkstaetten(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS werkstatt_id uuid REFERENCES public.werkstaetten(id);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS werkstatt_id uuid REFERENCES public.werkstaetten(id);
CREATE INDEX IF NOT EXISTS idx_claims_werkstatt_id ON public.claims(werkstatt_id) WHERE werkstatt_id IS NOT NULL;

-- Provisionen (Schema gespiegelt nach makler_provisionen)
CREATE TABLE IF NOT EXISTS public.werkstatt_provisionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstatt_id uuid NOT NULL REFERENCES public.werkstaetten(id),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  fall_id uuid,
  betrag_netto_eur numeric(10,2) NOT NULL,
  trigger_event text NOT NULL DEFAULT 'claim_created',
  trigger_at timestamptz NOT NULL DEFAULT now(),
  hold_until timestamptz,
  status text NOT NULL DEFAULT 'pending',
  storniert_am timestamptz,
  storno_grund text,
  ausgezahlt_am timestamptz,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT werkstatt_provisionen_status_check CHECK (status IN ('pending','freigegeben','storniert','ausgezahlt'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_werkstatt_provisionen_claim ON public.werkstatt_provisionen(claim_id);
CREATE INDEX IF NOT EXISTS idx_werkstatt_provisionen_werkstatt_status ON public.werkstatt_provisionen(werkstatt_id, status);
CREATE INDEX IF NOT EXISTS idx_werkstatt_provisionen_pending_release ON public.werkstatt_provisionen(hold_until) WHERE status='pending';

-- RLS: Werkstatt liest nur ihre eigenen Provisionen; Admin alles
ALTER TABLE public.werkstatt_provisionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wp_admin_all ON public.werkstatt_provisionen;
CREATE POLICY wp_admin_all ON public.werkstatt_provisionen FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'));
DROP POLICY IF EXISTS wp_werkstatt_read ON public.werkstatt_provisionen;
CREATE POLICY wp_werkstatt_read ON public.werkstatt_provisionen FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.werkstaetten w WHERE w.id = werkstatt_provisionen.werkstatt_id AND w.user_id = auth.uid()));
