-- AAR-321 (Child 1 von AAR-320): DB-Fundament Dokumenten-Management v2.
-- Kein Code-Refactor — das macht Child 2 (AAR-322).
--
-- Applied via Supabase MCP apply_migration am 2026-04-17.
-- Dieses File ist die kanonische Kopie für git-History und Review.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.dokument_katalog CASCADE;
--   DROP TYPE IF EXISTS dokument_kategorie;
--   ALTER TABLE public.pflichtdokumente
--     DROP COLUMN IF EXISTS angefordert_von_rolle,
--     DROP COLUMN IF EXISTS angefordert_von_user_id,
--     DROP COLUMN IF EXISTS angefordert_am,
--     DROP COLUMN IF EXISTS begruendung,
--     DROP COLUMN IF EXISTS frist,
--     DROP COLUMN IF EXISTS sort_order;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS zeugen_vorhanden;
--   ALTER TABLE public.faelle DROP COLUMN IF EXISTS zeugen_vorhanden;

-- 1. Kategorie-Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dokument_kategorie') THEN
    CREATE TYPE dokument_kategorie AS ENUM (
      'stammdaten', 'unfall', 'personenschaden', 'fahrzeug',
      'kosten', 'kanzlei', 'gutachten', 'sonstiges'
    );
  END IF;
END$$;

-- 2. Katalog-Tabelle
CREATE TABLE IF NOT EXISTS public.dokument_katalog (
  slot_id              TEXT PRIMARY KEY,
  label                TEXT NOT NULL,
  beschreibung         TEXT,
  kategorie            dokument_kategorie NOT NULL,
  freigeschaltet_wenn  JSONB,
  pflicht_wenn         JSONB,
  sichtbar_fuer        TEXT[] NOT NULL DEFAULT ARRAY['admin']::text[],
  anforderbar_von      TEXT[] NOT NULL DEFAULT ARRAY['admin','kundenbetreuer']::text[],
  uploadbar_von        TEXT[] NOT NULL DEFAULT ARRAY['admin','kundenbetreuer']::text[],
  multi_file           BOOLEAN NOT NULL DEFAULT false,
  akzeptierte_mime_types TEXT[] NOT NULL DEFAULT ARRAY['image/jpeg','image/png','application/pdf']::text[],
  max_mb               INT NOT NULL DEFAULT 10,
  sort_order           INT NOT NULL DEFAULT 0,
  aktiv                BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_katalog_aktiv ON public.dokument_katalog(aktiv) WHERE aktiv = true;
CREATE INDEX IF NOT EXISTS idx_katalog_kategorie ON public.dokument_katalog(kategorie);

-- 3. pflichtdokumente erweitern
ALTER TABLE public.pflichtdokumente
  ADD COLUMN IF NOT EXISTS angefordert_von_rolle TEXT,
  ADD COLUMN IF NOT EXISTS angefordert_von_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS angefordert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS begruendung TEXT,
  ADD COLUMN IF NOT EXISTS frist TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pflichtdokumente_fall_sort ON public.pflichtdokumente(fall_id, sort_order);

-- 4. Zeugen-Flag
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS zeugen_vorhanden BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS zeugen_vorhanden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.zeugen_vorhanden IS
  'AAR-321: Dispatch-Abfrage — waren Zeugen am Unfall anwesend? Schaltet Pflicht-Slot zeugenbericht frei.';
COMMENT ON COLUMN public.faelle.zeugen_vorhanden IS
  'AAR-321: Aus leads.zeugen_vorhanden beim Fall-Anlegen kopiert; nachträglich via KB editierbar.';

-- 5. updated_at-Trigger
CREATE OR REPLACE FUNCTION public.dokument_katalog_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dokument_katalog_updated_at ON public.dokument_katalog;
CREATE TRIGGER trg_dokument_katalog_updated_at
  BEFORE UPDATE ON public.dokument_katalog
  FOR EACH ROW EXECUTE FUNCTION public.dokument_katalog_set_updated_at();

-- 6. RLS
ALTER TABLE public.dokument_katalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dokument_katalog_read ON public.dokument_katalog;
CREATE POLICY dokument_katalog_read ON public.dokument_katalog
  FOR SELECT TO authenticated
  USING (
    aktiv = true
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin')
  );

DROP POLICY IF EXISTS dokument_katalog_write_admin ON public.dokument_katalog;
CREATE POLICY dokument_katalog_write_admin ON public.dokument_katalog
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'));

COMMENT ON TABLE public.dokument_katalog IS
  'AAR-321 (Child 1 von AAR-320): Zentraler Katalog aller Dokument-Slots. JSON-Rule-DSL für freigeschaltet_wenn/pflicht_wenn; Rule-Evaluator in Child 2 (AAR-322).';
