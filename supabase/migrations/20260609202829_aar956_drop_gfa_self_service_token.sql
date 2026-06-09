-- AAR-956 §1d Teil 2: Drop des /anfrage-self_service_token-Doppels.
-- Kanonischer Ersatz = /start -> /flow (flow_links). Code reader-frei auf staging+main
-- (anfrage-actions in #2583 geloescht; 0 .select/.eq/.insert/.update auf self_service_token);
-- 0 Views/Policies/Functions referenzieren die Spalten; der partial-unique-idx
-- gfa_self_service_token_uq haengt an der Spalte (eingefuehrt in 20260531123653).
-- Recorded-Version 20260609202829 == Dateiname (Regel 2, Twin-Drift-Schutz).
DROP INDEX IF EXISTS public.gfa_self_service_token_uq;
ALTER TABLE public.gutachter_finder_anfragen
  DROP COLUMN IF EXISTS self_service_token,
  DROP COLUMN IF EXISTS self_service_token_expires_at;
