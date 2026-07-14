-- Spec B: Werkstatt-Matching-Foundation (Aaron 14.07.)
-- Ziel: "bis zu 5 Vorschlaege, gerankt, mit wirklichem Grund warum das passt".
-- Ranking: Marke ("BMW markengebunden schlaegt freie Werkstatt") > Gewerke-Fit > verifiziert > Entfernung
-- (Anker = FAHRZEUGSTANDORT, nicht Besichtigungsort). Harte Filter: Fahrzeug-Gruppe + Gewerke.
--
-- Von den drei Achsen existiert bisher nur EINE: Schaden-Gewerke (schadenskategorie +
-- werkstaetten.faehigkeiten + KI-Schadenbild-Klassifikation). Marke und Fahrzeugklasse fehlen komplett.

-- ── 1) EU-/KBA-Fahrzeugklassen als Referenz-Daten ─────────────────────────────────────────────────
-- Die Klasse steht IM FAHRZEUGSCHEIN (ZB I, Feld J) -> deterministisch erfassbar, KEIN KI, keine
-- Schwacke-Lizenz. (Die Schwacke-Klassen A-L sind etwas anderes: Nutzungsausfall-Tagessaetze,
-- siehe nutzungsausfall_klasse_saetze.)
--
-- Die Werkstatt denkt nicht in "M1", sondern in "PKW" -> jede EU-Klasse mappt auf eine groebere
-- REPARATUR-GRUPPE. Als Tabelle (nicht als CASE im Code), damit das Mapping ohne Deploy pflegbar ist.
CREATE TABLE public.fahrzeugklassen (
  eu_klasse        text PRIMARY KEY,
  bezeichnung      text NOT NULL,
  reparatur_gruppe text NOT NULL,
  sortierung       integer NOT NULL DEFAULT 100,
  CONSTRAINT fahrzeugklassen_gruppe_check CHECK (reparatur_gruppe IN
    ('pkw', 'transporter', 'lkw', 'bus', 'motorrad', 'leichtfahrzeug', 'anhaenger', 'land_forst'))
);

COMMENT ON TABLE public.fahrzeugklassen IS
  'EU-/KBA-Fahrzeugklassen (Fahrzeugschein ZB I, Feld J) -> Reparatur-Gruppe fuer das Werkstatt-Matching. '
  'NICHT die Schwacke-Nutzungsausfall-Klassen (A-L) — das ist eine andere Achse.';

ALTER TABLE public.fahrzeugklassen ENABLE ROW LEVEL SECURITY;
CREATE POLICY fahrzeugklassen_read ON public.fahrzeugklassen
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.fahrzeugklassen (eu_klasse, bezeichnung, reparatur_gruppe, sortierung) VALUES
  -- M: Personenbefoerderung
  ('M1', 'PKW / Wohnmobil (max. 8 Sitzplaetze)',                 'pkw',            10),
  ('M2', 'Kleinbus (>8 Sitze, bis 5 t)',                          'bus',            60),
  ('M3', 'Bus (>8 Sitze, ueber 5 t)',                             'bus',            61),
  -- N: Gueterbefoerderung
  ('N1', 'Leichtes Nutzfahrzeug / Transporter (bis 3,5 t)',       'transporter',    20),
  ('N2', 'LKW (3,5 bis 12 t)',                                    'lkw',            30),
  ('N3', 'Schwerer LKW / Zugmaschine (ueber 12 t)',               'lkw',            31),
  -- L: Zwei-, drei- und vierraedrige Kraftfahrzeuge
  ('L1e', 'Leichtes zweiraedriges Kraftfahrzeug (bis 45 km/h)',   'leichtfahrzeug', 70),
  ('L2e', 'Dreiraedriges Kleinkraftrad (bis 45 km/h)',            'leichtfahrzeug', 71),
  ('L3e', 'Kraftrad / Motorrad (ueber 45 km/h)',                  'motorrad',       40),
  ('L4e', 'Kraftrad mit Beiwagen',                                'motorrad',       41),
  ('L5e', 'Dreiraedriges Kraftfahrzeug (ueber 4 kW)',             'leichtfahrzeug', 72),
  ('L6e', 'Leichtkraftfahrzeug (bis 425 kg, max. 45 km/h)',       'leichtfahrzeug', 73),
  ('L7e', 'Schweres vierraedriges Kraftfahrzeug (z.B. Quad)',     'leichtfahrzeug', 74),
  -- O: Anhaenger
  ('O1', 'Leichter Anhaenger (bis 750 kg)',                       'anhaenger',      80),
  ('O2', 'Anhaenger (750 kg bis 3,5 t)',                          'anhaenger',      81),
  ('O3', 'Anhaenger (3,5 bis 10 t)',                              'anhaenger',      82),
  ('O4', 'Schwerer Anhaenger (ueber 10 t)',                       'anhaenger',      83),
  -- T/C/R/S: Land- und Forstwirtschaft
  ('T',  'Radtraktor (T1-T4)',                                    'land_forst',     90),
  ('C',  'Kettentraktor / Raupenschlepper (C1-C4)',               'land_forst',     91),
  ('R',  'Land-/forstwirtschaftlicher Anhaenger (R1-R4)',         'land_forst',     92),
  ('S',  'Gezogenes auswechselbares Geraet (S1/S2)',              'land_forst',     93);

-- ── 2) Werkstatt: die zwei fehlenden Matching-Achsen ──────────────────────────────────────────────
-- faehigkeiten (Gewerke) existiert bereits. Marke + Fahrzeug-Gruppe fehlen komplett -> das Matching
-- filtert heute NIE danach.
ALTER TABLE public.werkstaetten
  ADD COLUMN IF NOT EXISTS marken              text[],
  ADD COLUMN IF NOT EXISTS ist_freie_werkstatt boolean,
  ADD COLUMN IF NOT EXISTS fahrzeug_gruppen    text[];

COMMENT ON COLUMN public.werkstaetten.marken IS
  'Welche Automarken die Werkstatt fuehrt (normalisiert uppercase, z.B. {BMW, MINI}). Marken-Match schlaegt freie Werkstatt.';
COMMENT ON COLUMN public.werkstaetten.ist_freie_werkstatt IS
  'Markenoffene (freie) Werkstatt — repariert alle Marken. Rankt hinter einer Markenwerkstatt.';
COMMENT ON COLUMN public.werkstaetten.fahrzeug_gruppen IS
  'Welche Reparatur-Gruppen die Werkstatt bedient ({pkw, transporter}). NULL/leer = unbekannt -> nicht ausschliessen, aber schlechter ranken (eine ungepflegte PKW-Werkstatt darf nicht auf LKW matchen).';

-- ── 3) Fahrzeugklasse auf Lead + Vehicle ─────────────────────────────────────────────────────────
-- vehicles = SSoT nach dem Convert; leads = der Flow laeuft VOR dem Convert.
-- hsn/tsn existieren auf beiden bereits — der ZB1-OCR liest sie aus und WIRFT SIE WEG
-- (zb1-fields.ts: dbField=null). Das ist ein Mapper-Fix, kein DDL.
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS fahrzeugklasse text;
ALTER TABLE public.leads    ADD COLUMN IF NOT EXISTS fahrzeugklasse text;

COMMENT ON COLUMN public.vehicles.fahrzeugklasse IS
  'EU-/KBA-Fahrzeugklasse aus dem Fahrzeugschein (ZB I, Feld J): M1 | N1 | N2 | L3e | ... -> fahrzeugklassen.eu_klasse.';
COMMENT ON COLUMN public.leads.fahrzeugklasse IS
  'EU-/KBA-Fahrzeugklasse (ZB I, Feld J). Wird beim Convert nach vehicles.fahrzeugklasse kopiert.';
