-- Vollstaendig DB-driven (Aaron 14.07.): nicht nur WELCHE Steps ein Szenario hat, sondern auch
-- WANN jeder Step sichtbar ist — als Daten. Sonst ist es nicht wiederverwendbar: jede neue Weiche
-- und jeder neue Step braeuchte sonst wieder einen Deploy.
--
-- Generalisiert das bestehende conditional_on-Muster (onboarding_felder) auf die STEPS.
--
-- Bedingungs-Semantik (der Evaluator ist pure + vitest-getestet, nur die DATEN kommen aus der DB):
--   NULL                      -> immer sichtbar
--   {"feld": null}            -> sichtbar, wenn das Feld LEER ist (null/''/undefined)
--   {"feld": "$gesetzt"}      -> sichtbar, wenn das Feld GESETZT ist
--   {"feld": "wert"}          -> sichtbar, wenn das Feld == "wert"
--   {"feld": ["a","b"]}       -> sichtbar, wenn das Feld einer der Werte ist
--   mehrere Keys              -> UND-Verknuepfung
CREATE TABLE public.flow_szenario_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  szenario_id  text NOT NULL REFERENCES public.flow_szenarien(id) ON DELETE CASCADE,
  step_id      text NOT NULL,
  reihenfolge  integer NOT NULL,
  bedingung    jsonb,
  aktiv        boolean NOT NULL DEFAULT true,
  erstellt_am  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flow_szenario_steps_unique UNIQUE (szenario_id, step_id)
);

COMMENT ON TABLE public.flow_szenario_steps IS
  'Step-Sequenz je Szenario MIT Sichtbarkeits-Bedingung (jsonb). Damit sind auch die dynamischen '
  'Weichen ("Termin-Step nur wenn kein SV zugeordnet") Daten statt Code -> neue Steps/Weichen ohne Deploy.';

ALTER TABLE public.flow_szenario_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY flow_szenario_steps_read ON public.flow_szenario_steps
  FOR SELECT TO anon, authenticated USING (true);

-- Die Steps ziehen aus flow_szenarien.steps hierher um -> eine SSoT.
ALTER TABLE public.flow_szenarien DROP COLUMN steps;

-- Szenario fuer den noch unqualifizierten Lead (schuldfrage offen). Prioritaet 0 = greift nur,
-- wenn kein spezifischeres Szenario matcht. Nach dem Quali-Step wird das Szenario neu ermittelt.
INSERT INTO public.flow_szenarien
  (id, bezeichnung, schuldfrage, eigene_versicherung, service_typ, feststellung_zweig, prioritaet)
VALUES
  ('unqualifiziert', 'Schuldfrage noch offen - Quali holt sie nach', NULL, NULL, NULL, 'unfall', 0);

INSERT INTO public.flow_szenario_steps (szenario_id, step_id, reihenfolge, bedingung) VALUES
  -- ── unqualifiziert: erst die Schuldfrage klaeren, dann wird neu ermittelt ──────────────
  ('unqualifiziert', 'zusammenfassung', 1, NULL),
  ('unqualifiziert', 'quali',           2, '{"schuldfrage": null}'::jsonb),

  -- ── haftpflicht: Feststellung(voll) -> Gutachter -> Werkstatt -> SA -> Konto ───────────
  ('haftpflicht', 'zusammenfassung', 1, NULL),
  ('haftpflicht', 'feststellung',    2, '{"unfallhergang": null}'::jsonb),
  ('haftpflicht', 'termin',          3, '{"sv_id": null}'::jsonb),
  ('haftpflicht', 'gutachter',       4, NULL),
  ('haftpflicht', 'werkstatt',       5, '{"reparatur_werkstatt_id": null}'::jsonb),
  ('haftpflicht', 'sa',              6, NULL),
  ('haftpflicht', 'account',         7, NULL),

  -- ── nur_gutachter: wie Haftpflicht, aber ohne Werkstatt-Vermittlung ───────────────────
  ('nur_gutachter', 'zusammenfassung', 1, NULL),
  ('nur_gutachter', 'feststellung',    2, '{"unfallhergang": null}'::jsonb),
  ('nur_gutachter', 'termin',          3, '{"sv_id": null}'::jsonb),
  ('nur_gutachter', 'gutachter',       4, NULL),
  ('nur_gutachter', 'sa',              5, NULL),
  ('nur_gutachter', 'account',         6, NULL),

  -- ── teilschuld: nur Rueckruf beim Dispatch (Haftung wird persoenlich geklaert) ────────
  ('teilschuld', 'zusammenfassung', 1, NULL),
  ('teilschuld', 'rueckruf',        2, NULL),

  -- ── kasko: KEIN Gutachter. Feststellung fragt den SCHADEN ab (nicht den Unfall!) ──────
  --    Bedingung daher fahrzeugschaden_beschreibung statt unfallhergang — genau dafuer sind
  --    die Bedingungen pro Szenario und nicht global.
  ('kasko', 'zusammenfassung', 1, NULL),
  ('kasko', 'feststellung',    2, '{"fahrzeugschaden_beschreibung": null}'::jsonb),
  ('kasko', 'werkstatt',       3, '{"reparatur_werkstatt_id": null}'::jsonb),
  ('kasko', 'account',         4, NULL),

  -- ── selbstzahler: wie Kasko ───────────────────────────────────────────────────────────
  ('selbstzahler', 'zusammenfassung', 1, NULL),
  ('selbstzahler', 'feststellung',    2, '{"fahrzeugschaden_beschreibung": null}'::jsonb),
  ('selbstzahler', 'werkstatt',       3, '{"reparatur_werkstatt_id": null}'::jsonb),
  ('selbstzahler', 'account',         4, NULL);
