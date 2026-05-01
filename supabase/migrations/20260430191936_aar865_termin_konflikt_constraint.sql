-- AAR-864/865: EXCLUSION CONSTRAINT gegen Doppelbuchung in gutachter_termine.
--
-- Aaron-Spec: KB/Admin müssen eine konsistente Sicht auf alle SV-Kalender
-- haben. Race-Conditions zwischen parallelen Buchungen oder Verlegungen
-- könnten heute zwei aktive Termine für denselben SV zur selben Zeit
-- erzeugen — DB-seitiger CONSTRAINT verhindert das jetzt hart.
--
-- Vorbedingungen:
--   1. btree_gist Extension (wird unten enabled)
--   2. Bestehende Konflikte auf 'storniert' setzen — sonst lehnt Postgres
--      die ALTER TABLE ADD CONSTRAINT ab.

-- ============================================================
-- 1) Extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 2) Cleanup bestehender Konflikte
-- ============================================================
-- Findet alle Paare (a.id < b.id) für denselben SV im aktiven Status mit
-- überlappendem Zeitfenster. Storniert beide Rows — fail-safe, weil
-- reservierte/bestätigte Slots in einem Konflikt-Zustand ohnehin manuell
-- aufgeräumt werden müssen. Der Auto-Expire-Cron räumt eh nach 1h ab.

WITH konflikt_paare AS (
  SELECT a.id AS a_id, b.id AS b_id
  FROM public.gutachter_termine a
  JOIN public.gutachter_termine b
    ON a.sv_id = b.sv_id
   AND a.id < b.id
   AND a.status IN ('bestaetigt','reserviert','verlegt','verlegung_pending')
   AND b.status IN ('bestaetigt','reserviert','verlegt','verlegung_pending')
   AND tstzrange(a.start_zeit, a.end_zeit) && tstzrange(b.start_zeit, b.end_zeit)
),
betroffene_ids AS (
  SELECT a_id AS id FROM konflikt_paare
  UNION
  SELECT b_id FROM konflikt_paare
)
UPDATE public.gutachter_termine
   SET status = 'storniert',
       cancelled_at = COALESCE(cancelled_at, now()),
       ablehnungsgrund = COALESCE(ablehnungsgrund, 'AAR-865: Konflikt vor EXCLUSION CONSTRAINT bereinigt')
 WHERE id IN (SELECT id FROM betroffene_ids);

-- ============================================================
-- 3) EXCLUSION CONSTRAINT
-- ============================================================
-- Verhindert dass zwei aktive Termine für denselben SV überlappen.
-- WHERE-Klausel beschränkt den Constraint auf "blockierende" Status —
-- abgesagte/storniere/abgelehnte Slots dürfen sich überlappen, weil sie
-- ohnehin nichts blockieren.
--
-- tstzrange ist [start_zeit, end_zeit) — exklusive end → ein Slot der um
-- 14:30 endet schließt nicht den 14:30-Start eines Folge-Slots aus.

ALTER TABLE public.gutachter_termine
  ADD CONSTRAINT gutachter_termine_no_sv_overlap
  EXCLUDE USING gist (
    sv_id WITH =,
    tstzrange(start_zeit, end_zeit) WITH &&
  )
  WHERE (status IN ('bestaetigt','reserviert','verlegt','verlegung_pending'));

COMMENT ON CONSTRAINT gutachter_termine_no_sv_overlap
  ON public.gutachter_termine
  IS 'AAR-864/865: Verhindert Doppelbuchung pro SV. Greift nur für blockierende Status; abgesagte/storniere/abgelehnte Slots dürfen sich überlappen.';
