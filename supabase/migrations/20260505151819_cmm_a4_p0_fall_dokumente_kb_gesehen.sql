-- A4 P0 (CMM 2026-05-05): KB-Ungelesen-Indikator für Kunde-Uploads.
--
-- Aaron-Spec: „wenn der Kunde was hochgeladen hat muss eine rote 1 am
-- Fall für den KB sein". Wir markieren pro fall_dokumente-Zeile wann der
-- KB sie gesehen hat — analog admin_termine.gesehen_am (AAR-724).
--
-- Logik im UI:
--   • Counter pro Fall = COUNT(*) WHERE uploaded_by_kunde=true AND kb_gesehen_am IS NULL
--   • Beim Öffnen der KB-Fallakte: UPDATE auf NOW() für alle ungesehenen
--     Kunde-Uploads dieses Falls
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, keine NOT-NULL-Constraint.

ALTER TABLE public.fall_dokumente
  ADD COLUMN IF NOT EXISTS kb_gesehen_am timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_fall_dokumente_kunde_ungesehen
  ON public.fall_dokumente (fall_id)
  WHERE uploaded_by_kunde = true AND kb_gesehen_am IS NULL AND geloescht_am IS NULL;

COMMENT ON COLUMN public.fall_dokumente.kb_gesehen_am IS
  'A4: Zeitpunkt wo KB diesen Kunde-Upload zur Kenntnis genommen hat. NULL = ungelesen, zeigt rote Badge im Kanban.';
