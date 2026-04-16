-- AAR-322 Audit-Fix: pflichtdokumente_typ_check + pflichtdokumente_quelle_check droppen.
--
-- Grund: Mit dem AAR-321-Katalog (24 Slots) wird dokument_katalog zur Quelle der
-- Wahrheit für erlaubte dokument_typ-Werte. Der alte pflichtdokumente_typ_check
-- kannte nur 14 Werte und blockt 17 von 24 Katalog-Slots. createPflichtdokumenteFromKatalog
-- (AAR-322) hätte bei jedem Fall mit Personenschaden/Zeugen/Vorschäden/Kanzlei-Slot
-- gecrasht.
--
-- pflichtdokumente_quelle_check erlaubt nur 'flowlink'/'portal'/'gutachter' —
-- mein Code schreibt 'system' (Katalog-driven automatic Create). Ohne Drop
-- crasht jeder neue Fall beim Pflichtdokument-Insert.
--
-- Zukünftige Typ-Validierung kommt über FK auf dokument_katalog.slot_id in
-- einem separaten Ticket (Konsolidierung der drei Dokument-Tabellen, siehe
-- AAR-320 out-of-scope).
--
-- Applied via Supabase MCP apply_migration am 2026-04-17. Kanonische Kopie.

ALTER TABLE public.pflichtdokumente DROP CONSTRAINT IF EXISTS pflichtdokumente_typ_check;
ALTER TABLE public.pflichtdokumente DROP CONSTRAINT IF EXISTS pflichtdokumente_quelle_check;

COMMENT ON COLUMN public.pflichtdokumente.dokument_typ IS
  'AAR-322: Slot-ID, referenziert dokument_katalog.slot_id (lose gekoppelt, kein FK um Legacy-Werte zu tolerieren).';
COMMENT ON COLUMN public.pflichtdokumente.quelle IS
  'AAR-322: Freitext. Beispiele: system (Katalog-driven), flowlink, portal, gutachter, admin, kanzlei.';
