-- Makler-Staffelung (Meilenstein-Boni) — 1:1 gespiegelt von werkstatt_staffelung
-- (20260626135720). Fundament (makler_provisionen + Release-Cron) existiert bereits.

-- makler_staffel_stufen: per-Makler Meilenstein-Konfiguration (Admin setzt Schwellen)
CREATE TABLE IF NOT EXISTS public.makler_staffel_stufen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  makler_id uuid NOT NULL REFERENCES public.makler(id) ON DELETE CASCADE,
  schwelle integer NOT NULL CHECK (schwelle > 0),
  bonus_betrag_netto numeric(10,2) NOT NULL CHECK (bonus_betrag_netto >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT makler_staffel_stufen_makler_schwelle_uq UNIQUE (makler_id, schwelle)
);
CREATE INDEX IF NOT EXISTS idx_makler_staffel_stufen_makler
  ON public.makler_staffel_stufen(makler_id);

ALTER TABLE public.makler_staffel_stufen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mss_admin_all ON public.makler_staffel_stufen;
CREATE POLICY mss_admin_all ON public.makler_staffel_stufen FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role));
DROP POLICY IF EXISTS mss_makler_read ON public.makler_staffel_stufen;
CREATE POLICY mss_makler_read ON public.makler_staffel_stufen FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.makler m WHERE m.id = makler_staffel_stufen.makler_id AND m.user_id = (SELECT auth.uid())));

-- makler_staffel_bonus: vergebene Boni (snapshot schwelle+betrag, idempotent pro schwelle)
CREATE TABLE IF NOT EXISTS public.makler_staffel_bonus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  makler_id uuid NOT NULL REFERENCES public.makler(id) ON DELETE CASCADE,
  stufe_id uuid REFERENCES public.makler_staffel_stufen(id) ON DELETE SET NULL,
  schwelle integer NOT NULL,
  bonus_betrag_netto numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'freigegeben'
    CHECK (status IN ('freigegeben','ausgezahlt','storniert')),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT makler_staffel_bonus_makler_schwelle_uq UNIQUE (makler_id, schwelle)
);
CREATE INDEX IF NOT EXISTS idx_makler_staffel_bonus_makler
  ON public.makler_staffel_bonus(makler_id);

ALTER TABLE public.makler_staffel_bonus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS msb_admin_all ON public.makler_staffel_bonus;
CREATE POLICY msb_admin_all ON public.makler_staffel_bonus FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role));
DROP POLICY IF EXISTS msb_makler_read ON public.makler_staffel_bonus;
CREATE POLICY msb_makler_read ON public.makler_staffel_bonus FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.makler m WHERE m.id = makler_staffel_bonus.makler_id AND m.user_id = (SELECT auth.uid())));

-- Vergabe-Funktion: settled-count (freigegeben+ausgezahlt) -> erreichte Stufen idempotent vergeben
CREATE OR REPLACE FUNCTION public.award_makler_staffel_boni(p_makler_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF p_makler_id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.makler_provisionen
   WHERE makler_id = p_makler_id AND status IN ('freigegeben','ausgezahlt');
  INSERT INTO public.makler_staffel_bonus
    (makler_id, stufe_id, schwelle, bonus_betrag_netto, status)
  SELECT s.makler_id, s.id, s.schwelle, s.bonus_betrag_netto, 'freigegeben'
    FROM public.makler_staffel_stufen s
   WHERE s.makler_id = p_makler_id AND s.schwelle <= v_count
  ON CONFLICT (makler_id, schwelle) DO NOTHING;
END; $$;

-- Trigger: feuert beim Release-Cron-UPDATE (pending->freigegeben) -> settled-count waechst -> Vergabe
CREATE OR REPLACE FUNCTION public.trg_award_makler_staffel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_makler_staffel_boni(NEW.makler_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_award_makler_staffel ON public.makler_provisionen;
CREATE TRIGGER trg_award_makler_staffel
  AFTER INSERT OR UPDATE OF status ON public.makler_provisionen
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_makler_staffel();

-- RPC nur fuer service_role (Admin-Action ruft via createAdminClient)
REVOKE ALL ON FUNCTION public.award_makler_staffel_boni(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_makler_staffel_boni(uuid) TO service_role;
