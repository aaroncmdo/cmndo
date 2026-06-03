-- Unisone Termin-Engine Phase 1 / Task 2
-- Backfill assignee aus den Legacy-FK-Spalten. Idempotent (WHERE assignee_id IS NULL)
-- -> faengt auch Zeilen, die zwischen Task 1 und 2 von Parallel-Sessions eingefuegt
-- wurden (Befund: Tabelle wuchs waehrend der Migration 19->20).
UPDATE public.gutachter_termine
SET assignee_typ = CASE
      WHEN sv_id      IS NOT NULL THEN 'sachverstaendiger'
      WHEN sv_lead_id IS NOT NULL THEN 'sv_lead'
      WHEN kb_id      IS NOT NULL THEN 'kundenbetreuer'
    END,
    assignee_id = COALESCE(sv_id, sv_lead_id, kb_id)
WHERE assignee_id IS NULL
  AND (sv_id IS NOT NULL OR sv_lead_id IS NOT NULL OR kb_id IS NOT NULL);
