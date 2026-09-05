-- Teil 2 zu 20260905185823: die Frage-Optionen selbst. Der CHECK (Teil 1) erlaubt die Werte, die
-- Auswahl im Flow zeigt sie erst mit diesem Update. Reihenfolge ist Absicht — Kollisionen zuerst
-- (haeufigster Fall), dann die Ereignisse ohne Gegner, 'sonstiges' bleibt am Ende als Auffang.
--
-- Config-Update, kein DDL: laeuft trotzdem als getrackte Migration, damit ein Replay (Preview-Branch,
-- db reset) dieselbe Auswahl hat wie prod. Wirkt SOFORT auf prod, der zugehoerige Code erst nach dem
-- Deploy (BROADCAST-config-migration-wirkt-sofort-code-erst-nach-deploy) — unschaedlich, weil die
-- neuen Werte ohne den Code nur zusaetzliche Auswahlkarten sind, die korrekt gespeichert werden.
update public.onboarding_felder
set optionen = '[
  {"label": "Spurwechsel", "value": "spurwechsel"},
  {"label": "Auffahrunfall", "value": "auffahrunfall"},
  {"label": "Vorfahrtsverletzung", "value": "vorfahrtsverletzung"},
  {"label": "Parkplatz", "value": "parkplatz"},
  {"label": "Hagel", "value": "hagel"},
  {"label": "Sturm, Blitz, Überschwemmung", "value": "sturm"},
  {"label": "Marder oder Tierbiss", "value": "marder"},
  {"label": "Wildunfall", "value": "wild"},
  {"label": "Glas oder Steinschlag", "value": "glas"},
  {"label": "Diebstahl oder Aufbruch", "value": "diebstahl"},
  {"label": "Sonstiges", "value": "sonstiges"}
]'::jsonb
where feld_key = 'schadentyp';
