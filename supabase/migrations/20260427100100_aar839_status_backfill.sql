-- AAR-839 Step 2/8: Status-Backfill der produktiven claims-Rows
--
-- Pre-Flight (2026-04-27): Alle 4 prod-Rows haben status='dispatch_done',
-- kein Mapping nötig. Diese Migration ist defensiv für künftige Edge-Cases
-- und lokale Test-DBs mit anderen Status-Werten.
--
-- Reihenfolge der Mappings (Status der wegfällt → neuer Wert):
--   offen + kein KB                  → dispatch_done
--   offen + KB zugewiesen            → in_bearbeitung
--   abgeschlossen                    → reguliert (Default-Annahme)
--   reguliert_teilweise              → reguliert
--   reguliert_vollstaendig           → reguliert
--   verjaehrt                        → abgelehnt + vs_ablehnungs_grund='verjaehrung'

UPDATE public.claims SET status = 'dispatch_done'
  WHERE status = 'offen' AND kundenbetreuer_id IS NULL;

UPDATE public.claims SET status = 'in_bearbeitung'
  WHERE status = 'offen' AND kundenbetreuer_id IS NOT NULL;

UPDATE public.claims SET status = 'reguliert'
  WHERE status = 'abgeschlossen';

UPDATE public.claims SET status = 'reguliert'
  WHERE status IN ('reguliert_teilweise','reguliert_vollstaendig');

UPDATE public.claims
   SET status = 'abgelehnt',
       vs_ablehnungs_grund = COALESCE(vs_ablehnungs_grund, 'verjaehrung')
 WHERE status = 'verjaehrt';
