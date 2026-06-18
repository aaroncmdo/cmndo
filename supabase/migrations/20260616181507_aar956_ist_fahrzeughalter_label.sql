-- AAR-956 16.06. (Aaron): freundlicheres Label fuer ist_fahrzeughalter —
-- "Kunde = Fahrzeughalter?" -> "Gehoert das Fahrzeug dir?" (du-Form, kundennah).
-- de via label; en/pl/tr/ar/ru via i18n (gleiche Du-Anrede wie das Feld bereits nutzt).
update onboarding_felder
set label = 'Gehört das Fahrzeug dir?',
    i18n = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(i18n,
             '{en,label}', '"Is the vehicle yours?"'::jsonb),
             '{pl,label}', '"Czy pojazd należy do Ciebie?"'::jsonb),
             '{tr,label}', '"Araç size mi ait?"'::jsonb),
             '{ar,label}', '"هل المركبة ملكك؟"'::jsonb),
             '{ru,label}', '"Автомобиль принадлежит Вам?"'::jsonb)
where feld_key = 'ist_fahrzeughalter';
