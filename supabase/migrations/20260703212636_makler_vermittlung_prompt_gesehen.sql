-- Makler „Erste-Vermittlung"-Prompt: einmaliges Dashboard-Card-Flag.
-- Additiv, NOT NULL DEFAULT false -> unkritisch (Bestand = noch nicht gesehen).
ALTER TABLE makler
  ADD COLUMN IF NOT EXISTS vermittlung_prompt_gesehen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN makler.vermittlung_prompt_gesehen IS
  'True sobald der Makler die einmalige "Erste-Vermittlung"-Erfolgs-Card (passive Kanaele) weggeklickt hat. Steuert die einmalige Anzeige nach der ersten Vermittlung.';
