-- AAR-427: KB-Auto-Zuweisungs-Fallback — Marker-Felder auf faelle
--
-- Wenn bei der Lead→Fall-Konversion kein aktiver Kundenbetreuer verfügbar ist,
-- übernimmt als Fallback der erste aktive Admin die KB-Rolle. Diese Spalten
-- machen den Fallback explizit sichtbar für Reporting + Kapazitätsplanung.
--
-- * kundenbetreuer_fallback_flag — true wenn via Admin-Fallback zugewiesen
-- * kundenbetreuer_zugewiesen_am  — wann die (Erst-)Zuweisung erfolgte

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS kundenbetreuer_fallback_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kundenbetreuer_zugewiesen_am timestamptz;

COMMENT ON COLUMN public.faelle.kundenbetreuer_fallback_flag IS
  'AAR-427: True wenn kundenbetreuer_id via Admin-Fallback gesetzt wurde (kein KB verfügbar zum Zuweisungs-Zeitpunkt). Hilft bei KB-Kapazitätsplanung.';

COMMENT ON COLUMN public.faelle.kundenbetreuer_zugewiesen_am IS
  'AAR-427: Zeitpunkt der (ersten) KB-Zuweisung. Wird beim Wechsel nicht aktualisiert — separate Audit-Timeline übernimmt Verlaufs-Tracking.';

-- Backfill: bestehende Fälle mit kundenbetreuer_id bekommen created_at als
-- Zuweisungs-Datum (best-effort — genaues Datum nicht mehr rekonstruierbar)
UPDATE public.faelle
   SET kundenbetreuer_zugewiesen_am = COALESCE(konvertiert_am, created_at)
 WHERE kundenbetreuer_id IS NOT NULL
   AND kundenbetreuer_zugewiesen_am IS NULL;
;
