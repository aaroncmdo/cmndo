-- Faden 3 (Kasko-Feststellung-Verkuerzung, Aaron 08.08.): bei Kasko/Selbstzahler
-- (schuldfrage='eigenverantwortung', DIRECT_REPARATUR_WEG) ist der Polizei/Zeugen-
-- Micro-Step irrelevant (kein Unfall mit Gegner/Polizei bei Eigenschaden). Die
-- Gegner-Felder sind bereits conditional_on schuldfrage='gegner'; polizei_vor_ort +
-- zeugen waren conditional_on=null (immer sichtbar) -> jetzt ebenfalls an 'gegner'
-- gebunden. Der ganze polizei_zeugen-Micro-Step (feststellung-steps.ts) faellt bei
-- Kasko via computeActiveFeststellungSteps weg (kein sichtbarer feldKey). Wann/Wo
-- (unfalldatum/-ort) + Schaden + Fahrzeug bleiben (auch die eigene VS braucht sie).
UPDATE onboarding_felder AS f
SET conditional_on = '{"feld":"schuldfrage","equals":"gegner"}'::jsonb
FROM onboarding_phasen AS p
WHERE f.phase_id = p.id
  AND p.flow_key = 'lead-erfassung'
  AND p.phase_key = 'unfall'
  AND f.feld_key IN ('polizei_vor_ort', 'zeugen');
