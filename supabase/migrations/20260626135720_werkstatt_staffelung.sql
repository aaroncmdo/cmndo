-- werkstatt_staffel_stufen: per-Werkstatt Meilenstein-Konfiguration
CREATE TABLE IF NOT EXISTS public.werkstatt_staffel_stufen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstatt_id uuid NOT NULL REFERENCES public.werkstaetten(id) ON DELETE CASCADE,
  schwelle integer NOT NULL CHECK (schwelle > 0),
  bonus_betrag_netto numeric(10,2) NOT NULL CHECK (bonus_betrag_netto >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT werkstatt_staffel_stufen_werkstatt_schwelle_uq UNIQUE (werkstatt_id, schwelle)
);
CREATE INDEX IF NOT EXISTS idx_werkstatt_staffel_stufen_werkstatt
  ON public.werkstatt_staffel_stufen(werkstatt_id);

ALTER TABLE public.werkstatt_staffel_stufen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wss_admin_all ON public.werkstatt_staffel_stufen;
CREATE POLICY wss_admin_all ON public.werkstatt_staffel_stufen FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role));
DROP POLICY IF EXISTS wss_werkstatt_read ON public.werkstatt_staffel_stufen;
CREATE POLICY wss_werkstatt_read ON public.werkstatt_staffel_stufen FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.werkstaetten w WHERE w.id = werkstatt_staffel_stufen.werkstatt_id AND w.user_id = (SELECT auth.uid())));

-- werkstatt_staffel_bonus: vergebene Boni (snapshot schwelle+betrag, idempotent pro schwelle)
CREATE TABLE IF NOT EXISTS public.werkstatt_staffel_bonus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstatt_id uuid NOT NULL REFERENCES public.werkstaetten(id) ON DELETE CASCADE,
  stufe_id uuid REFERENCES public.werkstatt_staffel_stufen(id) ON DELETE SET NULL,
  schwelle integer NOT NULL,
  bonus_betrag_netto numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'freigegeben'
    CHECK (status IN ('freigegeben','ausgezahlt','storniert')),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT werkstatt_staffel_bonus_werkstatt_schwelle_uq UNIQUE (werkstatt_id, schwelle)
);
CREATE INDEX IF NOT EXISTS idx_werkstatt_staffel_bonus_werkstatt
  ON public.werkstatt_staffel_bonus(werkstatt_id);

ALTER TABLE public.werkstatt_staffel_bonus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wsb_admin_all ON public.werkstatt_staffel_bonus;
CREATE POLICY wsb_admin_all ON public.werkstatt_staffel_bonus FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role));
DROP POLICY IF EXISTS wsb_werkstatt_read ON public.werkstatt_staffel_bonus;
CREATE POLICY wsb_werkstatt_read ON public.werkstatt_staffel_bonus FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.werkstaetten w WHERE w.id = werkstatt_staffel_bonus.werkstatt_id AND w.user_id = (SELECT auth.uid())));

-- Vergabe-Funktion: settled-count (freigegeben+ausgezahlt) -> erreichte Stufen idempotent vergeben
CREATE OR REPLACE FUNCTION public.award_werkstatt_staffel_boni(p_werkstatt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF p_werkstatt_id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.werkstatt_provisionen
   WHERE werkstatt_id = p_werkstatt_id AND status IN ('freigegeben','ausgezahlt');
  INSERT INTO public.werkstatt_staffel_bonus
    (werkstatt_id, stufe_id, schwelle, bonus_betrag_netto, status)
  SELECT s.werkstatt_id, s.id, s.schwelle, s.bonus_betrag_netto, 'freigegeben'
    FROM public.werkstatt_staffel_stufen s
   WHERE s.werkstatt_id = p_werkstatt_id AND s.schwelle <= v_count
  ON CONFLICT (werkstatt_id, schwelle) DO NOTHING;
END; $$;

-- Trigger: feuert beim Release-Cron-UPDATE (pending->freigegeben) -> settled-count waechst -> Vergabe
CREATE OR REPLACE FUNCTION public.trg_award_werkstatt_staffel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_werkstatt_staffel_boni(NEW.werkstatt_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_award_staffel ON public.werkstatt_provisionen;
CREATE TRIGGER trg_award_staffel
  AFTER INSERT OR UPDATE OF status ON public.werkstatt_provisionen
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_werkstatt_staffel();

-- RPC nur fuer service_role (Admin-Action ruft via createAdminClient)
REVOKE ALL ON FUNCTION public.award_werkstatt_staffel_boni(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_werkstatt_staffel_boni(uuid) TO service_role;
