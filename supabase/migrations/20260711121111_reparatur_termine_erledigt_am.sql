-- WS6 Slice 1: Completion-Zeitstempel fuer den Reparatur-Abschluss.
-- Die Werkstatt markiert die Reparatur als erledigt (reparatur_termine.status='erledigt');
-- erledigt_am haelt den Zeitpunkt fest (Trigger fuer Claim-Close + Provisions-Freigabe + spaetere Ops-Phase).
-- Additiv, kollidiert nicht mit den werkstatt_vorschlag/rueckruf_wunschzeit-Spalten (6c630247).
ALTER TABLE public.reparatur_termine
  ADD COLUMN IF NOT EXISTS erledigt_am timestamptz;

COMMENT ON COLUMN public.reparatur_termine.erledigt_am IS
  'WS6: Zeitpunkt, zu dem die Werkstatt die Reparatur als erledigt markiert hat (status=erledigt). Trigger fuer Claim-Close + Provisions-Freigabe.';
