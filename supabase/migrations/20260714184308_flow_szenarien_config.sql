-- Die FlowLink-Szenario-Matrix als DATEN (Aaron 14.07.: "config-getrieben statt hardcoded STEPS").
-- Bisher lag die Step-Sequenz hardcodiert in FlowWizardKfz.tsx; ein neuer Weg brauchte einen Deploy.
--
-- Matching: NULL = Wildcard (Bedingung egal). Hoehere prioritaet gewinnt -> das SPEZIFISCHERE Szenario
-- schlaegt das allgemeinere (nur_gutachter vor haftpflicht).
--
-- Was bewusst NICHT hier steht: die DYNAMISCHEN Filter ("SV schon zugeordnet -> Termin-Step raus",
-- "Werkstatt haengt schon dran -> Picker raus"). Das ist ZUSTAND, keine Konfiguration — das kann eine
-- Tabelle nicht wissen. Die Config liefert die MAXIMALE Step-Sequenz je Szenario; der Code filtert
-- danach zustandsabhaengig. Ebenso bleibt 'quali' code-gesteuert (nur wenn die schuldfrage noch offen ist).
CREATE TABLE public.flow_szenarien (
  id                  text PRIMARY KEY,
  bezeichnung         text NOT NULL,
  -- Matching-Bedingungen (NULL = Wildcard)
  schuldfrage         text,
  eigene_versicherung text,
  service_typ         text,
  -- Ergebnis
  steps               text[] NOT NULL,
  feststellung_zweig  text NOT NULL DEFAULT 'unfall',
  prioritaet          integer NOT NULL DEFAULT 10,
  aktiv               boolean NOT NULL DEFAULT true,
  erstellt_am         timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flow_szenarien_feststellung_zweig_check
    CHECK (feststellung_zweig IN ('unfall', 'schaden')),
  CONSTRAINT flow_szenarien_schuldfrage_check
    CHECK (schuldfrage IS NULL OR schuldfrage IN ('gegner', 'unklar', 'eigenverantwortung')),
  CONSTRAINT flow_szenarien_eigene_versicherung_check
    CHECK (eigene_versicherung IS NULL OR eigene_versicherung IN ('ja', 'nein')),
  CONSTRAINT flow_szenarien_steps_nicht_leer CHECK (array_length(steps, 1) > 0)
);

COMMENT ON TABLE public.flow_szenarien IS
  'FlowLink-Szenario-Matrix als Daten. Matching: NULL=Wildcard, hoehere prioritaet = spezifischer. '
  'Die dynamischen Filter (SV/Werkstatt bereits zugeordnet, quali nur bei offener schuldfrage) bleiben Code = Zustand, keine Config.';

-- Referenz-Daten: der /flow laeuft ANON (Magic-Link, kein Auth-Cookie) -> anon muss lesen duerfen.
ALTER TABLE public.flow_szenarien ENABLE ROW LEVEL SECURITY;
CREATE POLICY flow_szenarien_read ON public.flow_szenarien
  FOR SELECT TO anon, authenticated USING (true);

-- Seed: die mit Aaron am 14.07. festgelegte Matrix.
INSERT INTO public.flow_szenarien
  (id, bezeichnung, schuldfrage, eigene_versicherung, service_typ, steps, feststellung_zweig, prioritaet)
VALUES
  -- Spezifischer als 'haftpflicht' (service_typ gesetzt) -> hoehere Prioritaet.
  ('nur_gutachter', 'Nur Gutachten (Haftpflicht-Variante)', 'gegner', NULL, 'nur_gutachter',
   ARRAY['zusammenfassung','feststellung','termin','gutachter','sa','account'], 'unfall', 20),

  ('haftpflicht', 'Haftpflicht (unverschuldet)', 'gegner', NULL, NULL,
   ARRAY['zusammenfassung','feststellung','termin','gutachter','werkstatt','sa','account'], 'unfall', 10),

  -- Teilschuld: die Haftung muss persoenlich geklaert werden -> nur Rueckruf beim Dispatch.
  -- Nach der Klaerung laeuft der Fall als Haftpflicht weiter (Dispatcher setzt schuldfrage='gegner').
  ('teilschuld', 'Teilschuld (Haftung unklar) - Rueckruf beim Dispatch', 'unklar', NULL, NULL,
   ARRAY['zusammenfassung','rueckruf'], 'unfall', 10),

  -- Kasko/Selbstzahler: KEIN SV-Gutachten, dafuer Werkstatt-Vermittlung. Feststellung nur Schaden+Fahrzeug
  -- (kein Unfallgegner) -> genau die Signale, die das Werkstatt-Matching braucht. Keine SA (kein SV-Auftrag).
  ('kasko', 'Kasko (Eigenverschulden, eigene Versicherung)', 'eigenverantwortung', 'ja', NULL,
   ARRAY['zusammenfassung','feststellung','werkstatt','account'], 'schaden', 10),

  ('selbstzahler', 'Selbstzahler (Eigenverschulden, ohne Kasko)', 'eigenverantwortung', 'nein', NULL,
   ARRAY['zusammenfassung','feststellung','werkstatt','account'], 'schaden', 10);
