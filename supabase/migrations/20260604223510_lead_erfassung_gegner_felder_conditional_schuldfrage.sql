-- AAR-956 Funnel (Aaron-Entscheidung 05.06.): Gegner-Felder NUR zeigen, wenn schuldfrage=gegner.
-- Bei 'unklar'/Eigenverschulden ausgeblendet. conditional_on auf die 6 gegner-spezifischen
-- lead-erfassung/unfall-Felder. FlowFeststellungStep + WizardClient honorieren conditional_on.
-- In-session-Quali-Wahl wird im /flow via FlowWizardKfz->FlowFeststellungStep in die values
-- gespeist (Code-Teil dieser PR). Idempotent (nur wo conditional_on noch NULL).
UPDATE onboarding_felder
SET conditional_on = '{"feld":"schuldfrage","equals":"gegner"}'::jsonb
WHERE feld_key IN ('gegner_kennzeichen','auslandskennzeichen','gegner_versicherung','gegner_schadennummer','gegner_telefon','gegner_email')
  AND phase_id IN (SELECT id FROM onboarding_phasen WHERE flow_key='lead-erfassung')
  AND conditional_on IS NULL;
