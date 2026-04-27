-- CMM-21: Multi-File-Upload pro Pflicht-Slot.
--
-- fall_dokumente war bisher nur über `dokument_typ` an pflichtdokumente
-- gekoppelt — fragil, weil mehrere Slots denselben Typ haben können
-- (z.B. wenn ein zweites Pflicht-Set für eine Nachbesichtigung angelegt
-- wird). Mit der direkten FK können wir pro Slot exakt zählen wie viele
-- Files schon da sind und Multi-Upload sauber abbilden.

ALTER TABLE public.fall_dokumente
  ADD COLUMN IF NOT EXISTS pflichtdokument_id uuid
  REFERENCES public.pflichtdokumente(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fall_dokumente_pflichtdokument_id
  ON public.fall_dokumente(pflichtdokument_id)
  WHERE pflichtdokument_id IS NOT NULL;

COMMENT ON COLUMN public.fall_dokumente.pflichtdokument_id IS
  'CMM-21: Direkte FK zur pflichtdokumente-Slot-Row. Erlaubt Multi-File pro Slot (eine fall_dokumente-Row pro File, aggregiert über die FK).';
