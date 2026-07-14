-- Zwei VERSCHIEDENE Orte (Aaron 14.07.) — sie werden bewusst NICHT konsolidiert:
--   fahrzeug_standort  -> wo steht das Auto?      -> Geo-Anker fuer den WERKSTATT-Finder
--   besichtigungsort   -> wo besichtigt der SV?   -> Geo-Anker fuer den GUTACHTER-Finder
-- Sie koennen identisch sein (SV kommt zum Auto), muessen es aber nicht (Auto steht in der Werkstatt,
-- oder noch am Unfallort). Jeder Ort wird nur abgefragt, wenn er in der DB noch NICHT bekannt ist.
--
-- Bug, den das mitfixt: findReparaturWerkstaettenForTarget ankert heute auf
-- besichtigungsort -> unfallort -> plz, also auf dem BESICHTIGUNGSort. Die Werkstatt muss aber nah
-- am FAHRZEUG sein.
--
-- Die Bedingungen pruefen die EFFEKTIVEN Orte (Fallback-Ketten, die page.tsx in den Kontext legt):
--   fahrzeug_standort_effektiv = fahrzeug_standort_adresse ?? unfallort
--   besichtigungsort_effektiv  = besichtigungsort_adresse ?? fahrzeug_standort_adresse ?? unfallort
-- (Der SV kommt zum Auto, wenn nichts anderes vereinbart ist — daher faellt der Besichtigungsort auf
-- den Fahrzeugstandort zurueck, aber NICHT umgekehrt.)

-- Neu seeden (die Ort-Steps muessen an die richtige Position, daher Reihenfolge komplett neu).
DELETE FROM public.flow_szenario_steps;

INSERT INTO public.flow_szenario_steps (szenario_id, step_id, reihenfolge, bedingung) VALUES
  -- ── unqualifiziert: erst die Schuldfrage, dann wird das Szenario neu ermittelt ─────────
  ('unqualifiziert', 'zusammenfassung', 1, NULL),
  ('unqualifiziert', 'quali',           2, '{"schuldfrage": null}'::jsonb),

  -- ── haftpflicht: Feststellung -> [Besichtigungsort] -> Gutachter -> [Fahrzeugort] -> Werkstatt ──
  ('haftpflicht', 'zusammenfassung',  1, NULL),
  ('haftpflicht', 'feststellung',     2, '{"unfallhergang": null}'::jsonb),
  ('haftpflicht', 'ort_besichtigung', 3, '{"besichtigungsort_effektiv": null}'::jsonb),
  ('haftpflicht', 'termin',           4, '{"sv_id": null}'::jsonb),
  ('haftpflicht', 'gutachter',        5, NULL),
  ('haftpflicht', 'ort_fahrzeug',     6, '{"fahrzeug_standort_effektiv": null}'::jsonb),
  ('haftpflicht', 'werkstatt',        7, '{"reparatur_werkstatt_id": null}'::jsonb),
  ('haftpflicht', 'sa',               8, NULL),
  ('haftpflicht', 'account',          9, NULL),

  -- ── nur_gutachter: wie Haftpflicht, ohne Werkstatt (also auch ohne Fahrzeugort) ────────
  ('nur_gutachter', 'zusammenfassung',  1, NULL),
  ('nur_gutachter', 'feststellung',     2, '{"unfallhergang": null}'::jsonb),
  ('nur_gutachter', 'ort_besichtigung', 3, '{"besichtigungsort_effektiv": null}'::jsonb),
  ('nur_gutachter', 'termin',           4, '{"sv_id": null}'::jsonb),
  ('nur_gutachter', 'gutachter',        5, NULL),
  ('nur_gutachter', 'sa',               6, NULL),
  ('nur_gutachter', 'account',          7, NULL),

  -- ── teilschuld: nur Rueckruf beim Dispatch ────────────────────────────────────────────
  ('teilschuld', 'zusammenfassung', 1, NULL),
  ('teilschuld', 'rueckruf',        2, NULL),

  -- ── kasko: KEIN Gutachter -> kein Besichtigungsort noetig, aber der FAHRZEUGSTANDORT ist
  --    Pflicht (Anker fuer den Werkstatt-Finder). Feststellung fragt den SCHADEN ab, nicht den Unfall.
  ('kasko', 'zusammenfassung', 1, NULL),
  ('kasko', 'feststellung',    2, '{"fahrzeugschaden_beschreibung": null}'::jsonb),
  ('kasko', 'ort_fahrzeug',    3, '{"fahrzeug_standort_effektiv": null}'::jsonb),
  ('kasko', 'werkstatt',       4, '{"reparatur_werkstatt_id": null}'::jsonb),
  ('kasko', 'account',         5, NULL),

  -- ── selbstzahler: wie Kasko ───────────────────────────────────────────────────────────
  ('selbstzahler', 'zusammenfassung', 1, NULL),
  ('selbstzahler', 'feststellung',    2, '{"fahrzeugschaden_beschreibung": null}'::jsonb),
  ('selbstzahler', 'ort_fahrzeug',    3, '{"fahrzeug_standort_effektiv": null}'::jsonb),
  ('selbstzahler', 'werkstatt',       4, '{"reparatur_werkstatt_id": null}'::jsonb),
  ('selbstzahler', 'account',         5, NULL);
