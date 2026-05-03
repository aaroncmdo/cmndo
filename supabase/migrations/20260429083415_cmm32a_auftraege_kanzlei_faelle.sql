-- CMM-32a: Sub-Entities auftraege + kanzlei_faelle.
--
-- Zweck: SV-Auftrags-Lifecycle (termin → besichtigung → gutachten) und
-- Regulierungs-Lifecycle (versicherungskontakt → auszahlung) sauber von
-- faelle trennen. Mehrere Aufträge pro Claim möglich (Erstgutachten +
-- Nachbesichtigung + Stellungnahme als jeweils eigene auftraege-Records).
--
-- Honorar-Felder (gutachten_betrag, sv_honorar_*) bleiben auf faelle —
-- sie sind Claim-eigene Werte, gefüttert durch Gutachten-OCR + QC.
--
-- Backfill für bestehende Fälle erfolgt in CMM-32b (separate Migration).

-- ── 1. auftraege ──────────────────────────────────────────────────────────

CREATE TABLE public.auftraege (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id uuid NOT NULL REFERENCES public.faelle(id) ON DELETE CASCADE,
  sv_id uuid NOT NULL REFERENCES public.sachverstaendige(id) ON DELETE RESTRICT,
  typ text NOT NULL CHECK (typ IN ('erstgutachten', 'nachbesichtigung', 'stellungnahme')),
  status text NOT NULL CHECK (status IN ('termin', 'besichtigung', 'gutachten', 'abgeschlossen')),
  reihenfolge int NOT NULL DEFAULT 1,
  vorheriger_auftrag_id uuid REFERENCES public.auftraege(id) ON DELETE SET NULL,
  gutachten_url text,
  gutachten_final_freigegeben boolean NOT NULL DEFAULT false,
  abgeschlossen_am timestamptz,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auftraege_fall ON public.auftraege(fall_id);
CREATE INDEX idx_auftraege_sv ON public.auftraege(sv_id);
CREATE INDEX idx_auftraege_status ON public.auftraege(status) WHERE status != 'abgeschlossen';

COMMENT ON TABLE public.auftraege IS
  'CMM-32: SV-Auftrags-Sub-Entity. Ein Fall kann mehrere Aufträge haben (Erstgutachten + Nachbesichtigung + Stellungnahme). Lifecycle: termin → besichtigung → gutachten → abgeschlossen.';

-- ── 2. kanzlei_faelle ─────────────────────────────────────────────────────

CREATE TABLE public.kanzlei_faelle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id uuid NOT NULL UNIQUE REFERENCES public.faelle(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('versicherungskontakt', 'auszahlung')),
  vs_kontakt_am timestamptz,
  ausgezahlt_am timestamptz,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kanzlei_faelle_fall ON public.kanzlei_faelle(fall_id);

COMMENT ON TABLE public.kanzlei_faelle IS
  'CMM-32: Regulierungs-Sub-Entity. Genau ein kanzlei_fall pro fall (UNIQUE). Lifecycle: versicherungskontakt → auszahlung. Wird angelegt sobald Erstgutachten QC-freigegeben ist.';

-- ── 3. gutachter_termine.auftrag_id FK ────────────────────────────────────

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS auftrag_id uuid REFERENCES public.auftraege(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gutachter_termine_auftrag ON public.gutachter_termine(auftrag_id);

COMMENT ON COLUMN public.gutachter_termine.auftrag_id IS
  'CMM-32: Termin gehört zu genau einem Auftrag. Backfill in CMM-32b.';

-- ── 4. RLS auftraege ──────────────────────────────────────────────────────

ALTER TABLE public.auftraege ENABLE ROW LEVEL SECURITY;

CREATE POLICY auftraege_sv_select ON public.auftraege
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sachverstaendige sv
      WHERE sv.id = auftraege.sv_id AND sv.profile_id = auth.uid()
    )
  );

CREATE POLICY auftraege_kunde_select ON public.auftraege
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.faelle f
      WHERE f.id = auftraege.fall_id AND f.kunde_id = auth.uid()
    )
  );

CREATE POLICY auftraege_admin_select ON public.auftraege
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rolle IN ('admin', 'dispatch', 'kundenbetreuer', 'kanzlei')
    )
  );

CREATE POLICY auftraege_admin_all ON public.auftraege
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rolle IN ('admin', 'dispatch')
    )
  );

-- ── 5. RLS kanzlei_faelle ─────────────────────────────────────────────────

ALTER TABLE public.kanzlei_faelle ENABLE ROW LEVEL SECURITY;

CREATE POLICY kanzlei_faelle_sv_select ON public.kanzlei_faelle
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.faelle f
      JOIN public.sachverstaendige sv ON sv.id = f.sv_id
      WHERE f.id = kanzlei_faelle.fall_id AND sv.profile_id = auth.uid()
    )
  );

CREATE POLICY kanzlei_faelle_kunde_select ON public.kanzlei_faelle
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.faelle f
      WHERE f.id = kanzlei_faelle.fall_id AND f.kunde_id = auth.uid()
    )
  );

CREATE POLICY kanzlei_faelle_admin_select ON public.kanzlei_faelle
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rolle IN ('admin', 'dispatch', 'kundenbetreuer', 'kanzlei')
    )
  );

CREATE POLICY kanzlei_faelle_admin_all ON public.kanzlei_faelle
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rolle IN ('admin', 'kundenbetreuer')
    )
  );

-- ── 6. updated_at-Trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_auftraege_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auftraege_updated_at
  BEFORE UPDATE ON public.auftraege
  FOR EACH ROW EXECUTE FUNCTION public.tg_auftraege_set_updated_at();

CREATE TRIGGER kanzlei_faelle_updated_at
  BEFORE UPDATE ON public.kanzlei_faelle
  FOR EACH ROW EXECUTE FUNCTION public.tg_auftraege_set_updated_at();
