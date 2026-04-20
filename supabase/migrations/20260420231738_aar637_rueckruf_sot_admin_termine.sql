-- AAR-637: Rückruf-SoT auf admin_termine konsolidieren.
--
-- Ausgangslage: Zwei parallele Rückruf-Systeme
--   1. leads.rueckruf_datum/rueckruf_termin/rueckruf_notiz/rueckruf_erledigt
--      (Dispatch-only, vom Dispatch-Lead-Drawer + dispatch/rueckrufe-Liste)
--   2. admin_termine mit typ='rueckruf' (Admin-Kalender)
--
-- Beide kennen einander nicht → ein Admin-Rückruf im Kalender landet nicht
-- in der Dispatch-Rückrufliste, ein Dispatch-Rückruf landet nicht im
-- Kalender. Mitarbeiter-Portal sieht überhaupt nichts.
--
-- Lösung: admin_termine ist Single Source of Truth für ALLE Rückrufe
-- (lead-basiert UND fall-basiert). Existierende admin_termine-Infra
-- unterstützt schon typ='rueckruf' + status + zugewiesen_an → wir brauchen
-- nur einen `lead_id`-FK, damit Lead-basierte Rückrufe möglich sind.
--
-- Daten: Aktuell eine einzige Lead-Row mit Rückruf-Daten — sie ist bereits
-- erledigt, hat keine Notiz, ist 3 Tage alt. Wird nicht migriert, sondern
-- mit den Spalten gedroppt (würde in keiner "offen"-Liste mehr auftauchen).

-- 1. lead_id-FK hinzufügen
ALTER TABLE public.admin_termine
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_termine_lead_id
  ON public.admin_termine(lead_id)
  WHERE lead_id IS NOT NULL;

COMMENT ON COLUMN public.admin_termine.lead_id IS
  'AAR-637: Optionaler Bezug zu einem Lead (pre-Fall). Für Rückrufe aus '
  'Dispatch vor Lead→Fall-Konversion. Entweder fall_id oder lead_id oder '
  'keins von beiden (z.B. interne Termine). ON DELETE SET NULL — Lead-Delete '
  'soll den Termin nicht hart löschen.';

-- 2. Legacy-Spalten auf leads droppen
ALTER TABLE public.leads
  DROP COLUMN IF EXISTS rueckruf_datum,
  DROP COLUMN IF EXISTS rueckruf_termin,
  DROP COLUMN IF EXISTS rueckruf_notiz,
  DROP COLUMN IF EXISTS rueckruf_erledigt;
