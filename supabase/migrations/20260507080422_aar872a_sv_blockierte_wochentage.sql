-- AAR-2026-05-07 (Aaron-Spec): Pro-SV-Wochentage-Blocking. Bisher hat
-- findBestSV.ts hardcoded nur Sa+So gesperrt; SV ohne explizite Konfiguration
-- bekommen weiter Slots Mo-Fr. SVs mit gesetztem `blockierte_wochentage`
-- werden an genau diesen Wochentagen vom Dispatching uebersprungen.
--
-- Konvention: 0=Sonntag, 1=Montag, 2=Dienstag, 3=Mittwoch, 4=Donnerstag,
-- 5=Freitag, 6=Samstag — passt zu JS Date.getDay().

ALTER TABLE public.sachverstaendige
  ADD COLUMN IF NOT EXISTS blockierte_wochentage int[] NOT NULL DEFAULT ARRAY[]::int[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sachverstaendige_blockierte_wochentage_chk'
  ) THEN
    ALTER TABLE public.sachverstaendige
      ADD CONSTRAINT sachverstaendige_blockierte_wochentage_chk
      CHECK (blockierte_wochentage <@ ARRAY[0,1,2,3,4,5,6]);
  END IF;
END $$;

COMMENT ON COLUMN public.sachverstaendige.blockierte_wochentage IS
  'AAR-2026-05-07: Wochentage an denen der SV keine Termine annimmt. 0=So..6=Sa (JS Date.getDay()).';
