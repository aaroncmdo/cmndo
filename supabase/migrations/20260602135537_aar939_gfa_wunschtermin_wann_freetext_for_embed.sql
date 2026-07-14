-- AAR-939 Stream 9: Monika schreibt einen menschenlesbaren Slot-String in
-- gutachter_finder_anfragen.wunschtermin_wann (Stream-2-Design: "menschenlesbarer
-- Slot-String fuer den Dispatcher"). Der native CHECK erlaubte aber nur
-- 'sofort'/'heute'/'tage' -> der Cluster-LP-Insert (source='kfz_gutachter_lp')
-- kippte mit insert_failed (im Stream-9-Live-Submit-Smoke 02.06. aufgedeckt).
--
-- Chirurgischer Fix: Enum-Guard bleibt fuer NATIVE Zeilen (source IS NULL), die
-- Monika-Zeilen (source IS NOT NULL) duerfen Freitext. wunschtermin_wann wird nur
-- angezeigt (src/app/sv-portal/anfragen/page.tsx: {r.wunschtermin_wann ?? '—'}),
-- kein Enum-Switch -> Freitext unkritisch.
ALTER TABLE public.gutachter_finder_anfragen
  DROP CONSTRAINT IF EXISTS gutachter_finder_anfragen_wunschtermin_wann_check;

ALTER TABLE public.gutachter_finder_anfragen
  ADD CONSTRAINT gutachter_finder_anfragen_wunschtermin_wann_check
  CHECK (
    source IS NOT NULL
    OR wunschtermin_wann IS NULL
    OR wunschtermin_wann = ANY (ARRAY['sofort'::text, 'heute'::text, 'tage'::text])
  );
