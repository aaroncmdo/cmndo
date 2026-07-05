-- Mini-Wizard legt einen leads-Row an (dritter Lead-Intake-Pfad neben
-- anfragen + gutachter_finder_anfragen, die beide dsgvo_zustimmung_am schon
-- fuehren). leads hatte die Spalte nie -> DSGVO-Einwilligungs-Zeitpunkt konnte
-- fuer den mini_wizard-Pfad nicht persistiert werden (Art. 7 Nachweisbarkeit).
-- Additiv + nullable = spiegelt die Schwester-Tabellen exakt, bricht nichts.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS dsgvo_zustimmung_am timestamptz;

COMMENT ON COLUMN public.leads.dsgvo_zustimmung_am IS
  'Zeitpunkt der DSGVO-Einwilligung (Art. 7 Nachweisbarkeit). Spiegelt anfragen/gutachter_finder_anfragen.dsgvo_zustimmung_am fuer den mini_wizard-Lead-Intake-Pfad.';
