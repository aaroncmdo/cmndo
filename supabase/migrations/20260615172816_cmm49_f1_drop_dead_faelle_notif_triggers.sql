-- CMM-49 Phase F1: zwei TOTE faelle-Notification-Trigger droppen.
-- filmcheck_ok -> auftraege (peelAuftraegeColumns) + gutachten_eingegangen_am -> gutachten.fertiggestellt_am
-- (SP-G PR2): beide faelle-Spalten werden nicht mehr geschrieben -> die AFTER-UPDATE-Trigger feuern nie.
-- Admin-Notification deckt der moderne emitEvent/EVENT_MATRIX-Pfad ab:
--   gutachten.fertig (gutachten/ocr-actions.ts:248) + kanzlei.uebergabe (state-machine.ts:293), beide admin in_app.
-- BEWUSST NICHT gedroppt: on_regulierung (noch aktiv via state-machine.ts:120; die Engine emittiert dort nur
--   das generische fall.status_changed, nicht regulierung.ergebnis -> Drop erst nach Engine-Emit = AAR-939).
-- notify_admins() BLEIBT (trg_lead_benachrichtigung nutzt sie weiterhin).
DROP TRIGGER IF EXISTS on_filmcheck_done ON public.faelle;
DROP TRIGGER IF EXISTS on_gutachten_eingegangen ON public.faelle;
DROP FUNCTION IF EXISTS public.trg_filmcheck_benachrichtigung();
DROP FUNCTION IF EXISTS public.trg_gutachten_benachrichtigung();
