-- P2b: leads.bevorzugter_kanal CHECK = whatsapp/sms/email. Der P1-Seed
-- (20260601194358) nutzte versehentlich 'anruf' (uebernommen vom
-- gutachter_finder_anfragen-Feld, das eine andere CHECK-Constraint hat).
-- Korrigiert auf die in der leads-Spalte erlaubten Werte, damit der
-- config-getriebene Dispatcher-Save (P2b) keinen CHECK-Verstoss erzeugt.
UPDATE onboarding_felder f
SET optionen = '[{"label":"WhatsApp","value":"whatsapp"},{"label":"SMS","value":"sms"},{"label":"E-Mail","value":"email"}]'::jsonb
FROM onboarding_phasen p
WHERE f.phase_id = p.id
  AND p.flow_key = 'lead-erfassung'
  AND f.feld_key = 'bevorzugter_kanal';
