-- 2026-05-12 Funnel v3 PR #7: gutachter_finder_anfragen bekommt kanzlei_wunsch.
-- Wird vom Wizard (kanzlei-Phase) gesetzt und bei der Konvertierung an
-- claims.kanzlei_wunsch durchgereicht.

ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS kanzlei_wunsch TEXT
    CHECK (kanzlei_wunsch IN ('partnerkanzlei','eigene_kanzlei','keine_kanzlei','noch_unentschieden') OR kanzlei_wunsch IS NULL);

COMMENT ON COLUMN public.gutachter_finder_anfragen.kanzlei_wunsch IS
  '2026-05-12 Funnel v3: vom Wizard gesetzt, wird in konvertiereAnfrageZuFall an claims.kanzlei_wunsch propagiert.';

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachter_finder_anfragen' AND column_name='kanzlei_wunsch';
