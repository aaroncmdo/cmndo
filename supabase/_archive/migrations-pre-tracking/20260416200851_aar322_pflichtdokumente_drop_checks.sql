ALTER TABLE public.pflichtdokumente DROP CONSTRAINT IF EXISTS pflichtdokumente_typ_check;
ALTER TABLE public.pflichtdokumente DROP CONSTRAINT IF EXISTS pflichtdokumente_quelle_check;
COMMENT ON COLUMN public.pflichtdokumente.dokument_typ IS 'AAR-322: Slot-ID, referenziert dokument_katalog.slot_id (lose gekoppelt).';
COMMENT ON COLUMN public.pflichtdokumente.quelle IS 'AAR-322: Freitext. system/flowlink/portal/gutachter/admin/kanzlei.';;
