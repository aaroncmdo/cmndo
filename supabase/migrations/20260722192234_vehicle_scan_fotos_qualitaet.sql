-- Z3 (Foto-Qualitaets-Ampel): pro Zustandsdoku-Foto ein Claude-Qualitaets-Score
-- (0-100 %, Bewertbarkeit fuer Schadenerkennung) + optionaler Kurz-Hinweis.
ALTER TABLE public.vehicle_scan_fotos
  ADD COLUMN qualitaet_prozent smallint CHECK (qualitaet_prozent BETWEEN 0 AND 100),
  ADD COLUMN qualitaet_hinweis text;
COMMENT ON COLUMN public.vehicle_scan_fotos.qualitaet_prozent IS 'Claude-Qualitaets-Score 0-100 (Bewertbarkeit fuer Schadenerkennung). NULL = nicht bewertet.';
COMMENT ON COLUMN public.vehicle_scan_fotos.qualitaet_hinweis IS 'Kurzer Claude-Hinweis bei schwacher Qualitaet (z.B. unscharf/dunkel). NULL = ok/nicht bewertet.';
