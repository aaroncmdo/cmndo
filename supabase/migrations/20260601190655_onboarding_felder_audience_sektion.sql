-- P0 (dispatch-config-unify): "eine Config, zwei Renderer".
-- audience steuert, welcher Renderer ein onboarding_felder-Feld sieht (Default 'beide'
--   -> bestehende Felder/Flows unveraendert). sektion gruppiert Felder im flachen
--   Dispatcher-Renderer (P2). Rein additiv.
ALTER TABLE onboarding_felder
  ADD COLUMN IF NOT EXISTS audience text DEFAULT 'beide'
    CHECK (audience IS NULL OR audience IN ('kunde', 'dispatcher', 'beide')),
  ADD COLUMN IF NOT EXISTS sektion text;
