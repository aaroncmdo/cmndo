-- Pflichtdok-Kanonisierung P1-Fix: altes_gutachten + altschaden_fotos hatten
-- malformed Regeln ({any_of:[{field,equals}]} ohne "op" + pflicht_wenn={}), die der
-- ruleEvaluator als "immer true" wertet. Unter der Katalog-Ableitung wuerden sie
-- faelschlich als immer-Pflicht erscheinen. Fix: an die vorschaden-Familie angleichen
-- (freigeschaltet wenn fall.vorschaden_erkannt; optional, kein Pflicht).
update public.dokument_katalog set
  freigeschaltet_wenn = '{"op":"eq","field":"fall.vorschaden_erkannt","value":true}'::jsonb,
  pflicht_wenn = null
where slot_id in ('altes_gutachten','altschaden_fotos');
