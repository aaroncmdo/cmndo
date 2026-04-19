-- AAR-548 D7: faelle.halter_name als GENERATED column
--
-- Vorher: halter_name war eine reguläre TEXT-Spalte die manuell/redundant
-- neben halter_vorname + halter_nachname gepflegt wurde. Legacy-Aggregat.
--
-- Nachher: GENERATED ALWAYS AS STORED column aus TRIM(vorname + ' ' + nachname).
-- Einzelfelder sind Source-of-Truth, halter_name ist abgeleitet (read-only).
--
-- View v_faelle_mit_aktuellem_termin selektiert faelle.* und hängt an der
-- Spalte — muss temporär dropped + recreated werden.

DROP VIEW IF EXISTS public.v_faelle_mit_aktuellem_termin;

ALTER TABLE public.faelle DROP COLUMN IF EXISTS halter_name;

ALTER TABLE public.faelle ADD COLUMN halter_name TEXT
  GENERATED ALWAYS AS (
    NULLIF(TRIM(BOTH FROM COALESCE(halter_vorname, '') || ' ' || COALESCE(halter_nachname, '')), '')
  ) STORED;

-- View identisch wiederherstellen (SELECT f.* nimmt neue generated col auto mit)
CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS
SELECT
  f.*,
  (
    SELECT t.id
    FROM public.faelle_termine t
    WHERE t.fall_id = f.id
      AND t.status IN ('geplant', 'zugewiesen', 'bestaetigt', 'unterwegs', 'vor_ort')
    ORDER BY t.start_at ASC
    LIMIT 1
  ) AS aktueller_termin_id,
  (
    SELECT t.start_at
    FROM public.faelle_termine t
    WHERE t.fall_id = f.id
      AND t.status IN ('geplant', 'zugewiesen', 'bestaetigt', 'unterwegs', 'vor_ort')
    ORDER BY t.start_at ASC
    LIMIT 1
  ) AS aktueller_termin_start_at,
  (
    SELECT t.status
    FROM public.faelle_termine t
    WHERE t.fall_id = f.id
      AND t.status IN ('geplant', 'zugewiesen', 'bestaetigt', 'unterwegs', 'vor_ort')
    ORDER BY t.start_at ASC
    LIMIT 1
  ) AS aktueller_termin_status,
  (
    SELECT t.sv_id
    FROM public.faelle_termine t
    WHERE t.fall_id = f.id
      AND t.status IN ('geplant', 'zugewiesen', 'bestaetigt', 'unterwegs', 'vor_ort')
    ORDER BY t.start_at ASC
    LIMIT 1
  ) AS aktueller_termin_sv_id
FROM public.faelle f;

COMMENT ON COLUMN public.faelle.halter_name IS
  'GENERATED STORED aus halter_vorname + halter_nachname. Source-of-Truth sind die Einzelfelder. Read-only.';
