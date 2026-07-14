-- Fix (von einem Test gefangen): der quali-Step hatte die Bedingung {"schuldfrage": null} — er erschien
-- also nur, solange die SCHULDFRAGE offen war. Damit fiel ein Lead mit
--   schuldfrage='eigenverantwortung' + eigene_versicherung=NULL
-- durchs Raster: kein spezifisches Szenario (kasko/selbstzahler brauchen die VS-Antwort) -> Fallback
-- 'unqualifiziert', aber der quali-Step blieb aus, weil die schuldfrage ja gesetzt ist. Der Kunde saehe
-- nur die Zusammenfassung und steckte fest — bzw. wuerde beim Convert still disqualifiziert
-- (resolveAbrechnungsweg = null). Das ist exakt die "scharfe Kante" aus dem Makler-Audit.
--
-- Richtig ist: der Quali-Step erscheint, wenn die QUALIFIZIERUNG unvollstaendig ist:
--   quali_offen = schuldfrage IS NULL
--              OR (schuldfrage = 'eigenverantwortung' AND eigene_versicherung IS NULL)
--
-- Die Ableitung liegt (wie bei den *_effektiv-Orten) im Kontext, den page.tsx baut — so bleibt die
-- Bedingungs-Syntax einfach (AND-only) und muss kein OR koennen.
UPDATE public.flow_szenario_steps
   SET bedingung = '{"quali_offen": true}'::jsonb
 WHERE szenario_id = 'unqualifiziert' AND step_id = 'quali';
