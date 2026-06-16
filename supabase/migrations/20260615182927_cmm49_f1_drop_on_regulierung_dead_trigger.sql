-- CMM-49 Phase F1 (Nachzug zu #2900): on_regulierung droppen — ebenfalls TOT.
-- Verifikation: regulierung_am ist in KANZLEI_FAELLE_COLS (upsert-kanzlei-fall.ts:11) -> die
-- state-machine peelt es via peelKanzleiFaelleColumns nach kanzlei_faelle, NICHT nach faelle.
-- faelle.regulierung_am wird von keinem Pfad geschrieben (live 0/81 gesetzt) -> der AFTER-UPDATE-
-- Trigger feuert nie. Der fruehere Hold (#2900) war ueber-vorsichtig (peel uebersehen; korrigiert
-- nach #2902-Verifikation "regulierung_* routen BEREITS nach kanzlei_faelle").
-- Admin-Notify fuer Regulierung deckt der moderne Pfad ab (claim.reguliert @endzustand-actions:212
-- mit betragEur + fall.status_changed @state-machine), nicht dieser tote Trigger.
DROP TRIGGER IF EXISTS on_regulierung ON public.faelle;
DROP FUNCTION IF EXISTS public.trg_regulierung_benachrichtigung();
-- notify_admins() BLEIBT (trg_lead_benachrichtigung).
