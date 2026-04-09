-- ARCH-1 POLISH: Anrede + Titel als Pflicht-/optional-Felder im Anlege-Wizard.
-- Aaron-Feedback: Dropdowns statt Free-Text damit die Welcome-Mail-Anrede
-- 'Hallo Herr Dr. Mustermann' deterministisch aus den Daten gebaut werden kann.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anrede TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS titel TEXT;
