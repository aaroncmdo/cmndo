-- AAR-864: SV-Termin-Verlegung mit Routen-Check, Kunden-Bestätigung
--          und Kalender-Reservierung.
--
-- State-Machine:
--   1. SV schlägt Verlegung vor:
--      - Alter Termin: status='bestaetigt' → 'verlegt'
--        (markiert, blockiert weiter den Slot, wird im SV-Kalender als
--         gedimmter Block "Verlegung beantragt" gerendert ohne Auftrags-
--         Details. Reminder/Geotracking greifen NICHT mehr — die filtern
--         auf status='bestaetigt'.)
--      - Neuer Slot: INSERT mit status='verlegung_pending',
--        verlegung_quelle_id=<altTermin.id>, eigene start_zeit/end_zeit
--   2. Kunde / KB / Admin bestätigt:
--      - Alter Termin: 'verlegt' → 'verschoben' (terminaler Zustand)
--      - Neuer Slot: 'verlegung_pending' → 'bestaetigt'
--   3. Kunde / KB / Admin lehnt ab:
--      - Alter Termin: 'verlegt' → 'bestaetigt' (Rollback)
--      - Neuer Slot: 'verlegung_pending' → 'storniert'
--   4. Eskalation T-48h ohne Kunden-Antwort:
--      - Vercel-Cron /api/cron/verlegung-eskalation alle 30min
--      - Sendet WhatsApp an Kunde + Mitteilungen an KB + Admin
--      - Setzt verlegung_eskalation_an_kb_an als Idempotenz-Marker
--      - DB liefert nur die Datenstruktur, kein DB-seitiger Cron, weil
--        mitteilungen-Tabelle empfaenger_id-spezifisch ist und WhatsApp
--        ohnehin von der TS-Seite kommt.

-- ============================================================
-- 1) Status-Werte erweitern um 'verlegt' + 'verlegung_pending'
-- ============================================================
ALTER TABLE public.gutachter_termine
  DROP CONSTRAINT IF EXISTS gutachter_termine_status_check;

ALTER TABLE public.gutachter_termine
  ADD CONSTRAINT gutachter_termine_status_check
  CHECK (status = ANY (ARRAY[
    'reserviert'::text,
    'bestaetigt'::text,
    'abgelehnt'::text,
    'abgesagt'::text,
    'storniert'::text,
    'abgeschlossen'::text,
    'sv_gesucht'::text,
    'gegenvorschlag'::text,
    'verschoben'::text,
    'verlegt'::text,
    'verlegung_pending'::text
  ]));

-- ============================================================
-- 2) Verlegungs-Spalten
-- ============================================================
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS verlegung_quelle_id UUID
    REFERENCES public.gutachter_termine(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verlegung_grund TEXT,
  ADD COLUMN IF NOT EXISTS verlegung_kunde_benachrichtigt_an TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verlegung_eskalation_an_kb_an TIMESTAMPTZ;

COMMENT ON COLUMN public.gutachter_termine.verlegung_quelle_id IS
  'AAR-864: FK auf den alten Termin. NEUE Slot-Row zeigt auf den ALTEN Termin (status=verlegt).';

COMMENT ON COLUMN public.gutachter_termine.verlegung_grund IS
  'AAR-864: Grund den der SV beim Verlegungs-Vorschlag angegeben hat.';

COMMENT ON COLUMN public.gutachter_termine.verlegung_kunde_benachrichtigt_an IS
  'AAR-864: Wann der Kunde über die Verlegung benachrichtigt wurde (WhatsApp + In-App).';

COMMENT ON COLUMN public.gutachter_termine.verlegung_eskalation_an_kb_an IS
  'AAR-864: Wann der KB+Admin eskaliert wurde, weil Kunde innerhalb 48h vor altem Termin nicht reagiert hat. Idempotenz-Marker.';

CREATE INDEX IF NOT EXISTS idx_gutachter_termine_verlegung_quelle
  ON public.gutachter_termine(verlegung_quelle_id)
  WHERE verlegung_quelle_id IS NOT NULL;

-- ============================================================
-- 3) View v_faelle_mit_aktuellem_termin — neuen Status berücksichtigen
-- ============================================================
-- Bei Verlegung im Pending-State existieren ZWEI Rows:
--   - alter Termin: status='verlegt' (versteckt aus aktueller_termin-Sicht)
--   - neuer Slot:   status='verlegung_pending' (= "der nächste Termin",
--     auf den der Kunde antworten muss)
--
-- Priority: bestaetigt > verlegung_pending > gegenvorschlag > reserviert
--   > durchgefuehrt > rest. Damit zeigt die Kunde-/KB-/Admin-Sicht den
-- verlegung_pending als "aktuellen Termin" während der Pending-Phase.
-- SV-Sicht (Kalender) liest direkt aus gutachter_termine, sieht also
-- beide Rows (verlegt = Block, verlegung_pending = neuer Slot).

DROP VIEW IF EXISTS public.v_faelle_mit_aktuellem_termin CASCADE;

CREATE VIEW public.v_faelle_mit_aktuellem_termin
WITH (security_invoker = true) AS
SELECT
  f.*,
  t.id  AS aktueller_termin_id,
  t.start_zeit AS aktueller_termin_start,
  t.end_zeit AS aktueller_termin_end,
  t.status AS aktueller_termin_status,
  t.sv_id AS aktueller_termin_sv_id,
  t.kanal AS aktueller_termin_kanal,
  t.typ AS aktueller_termin_typ,
  t.final_verbindlich_ab AS aktueller_termin_final_verbindlich_ab,
  t.start_zeit AS sv_termin,
  t.status AS gutachter_termin_status,
  t.status = 'bestaetigt'::text AS gutachter_termin_bestaetigt,
  t.vorgeschlagenes_datum AS gutachter_gegenvorschlag_datum,
  t.gegenvorschlag_grund AS gutachter_gegenvorschlag_grund
FROM public.faelle f
LEFT JOIN LATERAL (
  SELECT gt.*
  FROM public.gutachter_termine gt
  WHERE gt.fall_id = f.id
    AND gt.status = ANY (ARRAY[
      'bestaetigt'::text,
      'verlegung_pending'::text,
      'reserviert'::text,
      'durchgefuehrt'::text,
      'gegenvorschlag'::text
    ])
  ORDER BY (
    CASE gt.status
      WHEN 'bestaetigt'::text         THEN 1
      WHEN 'verlegung_pending'::text  THEN 2
      WHEN 'gegenvorschlag'::text     THEN 3
      WHEN 'reserviert'::text         THEN 4
      WHEN 'durchgefuehrt'::text      THEN 5
      ELSE 6
    END
  ),
  gt.start_zeit DESC NULLS LAST
  LIMIT 1
) t ON true;

COMMENT ON VIEW public.v_faelle_mit_aktuellem_termin IS
  'AAR-864: aktueller_termin priorisiert verlegung_pending > gegenvorschlag '
  '> reserviert > durchgefuehrt. verlegt-Slot ist absichtlich nicht in der '
  'Filter-Liste — er ist nur Slot-Blocker im SV-Kalender, nicht "der nächste '
  'Termin" aus Kunde-/KB-Sicht.';
