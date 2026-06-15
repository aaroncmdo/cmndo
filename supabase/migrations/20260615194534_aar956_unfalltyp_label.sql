-- AAR-956: Feld-Label "Schadentyp" -> "Unfalltyp". Die Optionen des Felds sind
-- Unfalltypen (Spurwechsel/Auffahrunfall/Vorfahrtsverletzung/Parkplatz/Sonstiges),
-- nicht Schadenarten. de/en/pl/tr korrigiert; ar/ru waren schon "Unfalltyp".
update onboarding_felder
set label = 'Unfalltyp',
    i18n = jsonb_set(jsonb_set(jsonb_set(i18n,
             '{en,label}', '"Accident type"'::jsonb),
             '{pl,label}', '"Rodzaj wypadku"'::jsonb),
             '{tr,label}', '"Kaza Türü"'::jsonb)
where feld_key = 'schadentyp';
