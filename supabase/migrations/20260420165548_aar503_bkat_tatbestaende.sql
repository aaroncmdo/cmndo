-- AAR-503 (B1): Bundeseinheitlicher Tatbestandskatalog (BKat) Lookup-Tabelle.
-- Quelle: KBA, BKat 01.09.2023 (15. Auflage).
--
-- Diese Migration legt das Schema + 2 Enums + Starter-Seed (~20 häufige TBs)
-- an. Die Voll-Befüllung (~150 TBs) erfolgt manuell durch Aaron oder ein
-- BKat-Kuration-Script.

-- ─── Enums ───────────────────────────────────────────────────────────────

CREATE TYPE public.bkat_schuldindiz AS ENUM (
  'gegner_klar',
  'gegner_wahrscheinlich',
  'geteilt',
  'kunde_verdacht',
  'neutral'
);

CREATE TYPE public.bkat_unfallart AS ENUM (
  'auffahrunfall',
  'vorfahrt',
  'kreuzung_rotlicht',
  'spurwechsel',
  'ueberholen',
  'abbiegen',
  'rueckwaerts_parken',
  'einfahren_anfahren',
  'dooring',
  'fussgaenger',
  'geschwindigkeit',
  'fahrerflucht',
  'alkohol_drogen',
  'grundregeln',
  'sonstiges'
);

-- ─── Tabelle ─────────────────────────────────────────────────────────────

CREATE TABLE public.bkat_tatbestaende (
  tbnr                  char(6)                   PRIMARY KEY,
  vorschrift            char(1)                   NOT NULL,
  paragraph             text                      NOT NULL,
  paragraph_num         smallint                  NOT NULL,
  bezeichnung           text                      NOT NULL,
  kurzform              text                      NOT NULL,
  unfallart             bkat_unfallart            NOT NULL,
  schuldindiz           bkat_schuldindiz          NOT NULL,
  mit_gefaehrdung       boolean                   DEFAULT false,
  mit_sachbeschaedigung boolean                   DEFAULT false,
  mit_unfall            boolean                   DEFAULT false,
  bussgeld_cent         integer,
  punkte                smallint                  DEFAULT 0,
  fahrverbot_monate     smallint                  DEFAULT 0,
  bkat_version          text                      NOT NULL DEFAULT '2023-09-01',
  erstellt_am           timestamptz               DEFAULT now(),
  aktualisiert_am       timestamptz               DEFAULT now()
);

CREATE INDEX idx_bkat_unfallart   ON public.bkat_tatbestaende(unfallart);
CREATE INDEX idx_bkat_paragraph   ON public.bkat_tatbestaende(vorschrift, paragraph_num);
CREATE INDEX idx_bkat_schuldindiz ON public.bkat_tatbestaende(schuldindiz);

COMMENT ON TABLE public.bkat_tatbestaende IS
  'AAR-503: Bundeseinheitlicher Tatbestandskatalog (BKat) Lookup. Quelle: KBA 01.09.2023 (15. Auflage). Unfall-relevante Tatbestände. Bußgeld in Cent, Punkte 0-2.';

-- ─── RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.bkat_tatbestaende ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bkat_tatbestaende_read_authenticated" ON public.bkat_tatbestaende
  FOR SELECT TO authenticated
  USING (true);

-- ─── Starter-Seed — 20 repräsentative TBs ────────────────────────────────
-- Deckt 9 der 13 Prio-Paragraphen ab (§1, §3, §4, §5, §7, §8, §9, §10, §14,
-- §24a StVG, §26, §34, §37). Restliche ~130 TBs folgen in Aaron-Kuration.
-- Bußgeld- und Punkte-Werte aus BKat 01.09.2023.

INSERT INTO public.bkat_tatbestaende
  (tbnr, vorschrift, paragraph, paragraph_num, bezeichnung, kurzform, unfallart, schuldindiz, mit_unfall, mit_sachbeschaedigung, bussgeld_cent, punkte, fahrverbot_monate) VALUES

('104600', '1', '§ 4 Abs. 1 StVO',   4, 'Sie hielten als Führer eines Kraftfahrzeugs den erforderlichen Sicherheitsabstand nicht ein. Es kam zum Unfall.', 'Abstand zu gering, mit Unfall', 'auffahrunfall', 'gegner_klar', true, true, 10000, 1, 0),
('104601', '1', '§ 4 Abs. 1 StVO',   4, 'Sie hielten den Sicherheitsabstand nicht ein. Es kam zu einer Sachbeschädigung.', 'Abstand zu gering, mit Sachschaden', 'auffahrunfall', 'gegner_klar', false, true, 8000, 1, 0),
('105600', '1', '§ 5 Abs. 3 Nr. 1 StVO', 5, 'Sie überholten, obwohl die Verkehrslage dies nicht klar zuließ. Es kam zum Unfall.', 'Überholen bei unklarer Verkehrslage, mit Unfall', 'ueberholen', 'geteilt', true, true, 15000, 1, 1),
('107600', '1', '§ 7 Abs. 5 StVO',   7, 'Sie wechselten den Fahrstreifen ohne auf den nachfolgenden Verkehr zu achten. Es kam zum Unfall.', 'Spurwechsel ohne Rückschau, mit Unfall', 'spurwechsel', 'gegner_wahrscheinlich', true, true, 10000, 1, 0),
('108600', '1', '§ 8 Abs. 1 StVO',   8, 'Sie missachteten die Vorfahrt des von rechts kommenden Fahrzeugs. Es kam zum Unfall.', 'Vorfahrt missachtet (rechts-vor-links), mit Unfall', 'vorfahrt', 'gegner_klar', true, true, 12000, 1, 0),
('108601', '1', '§ 8 Abs. 2 StVO',   8, 'Sie missachteten die durch Verkehrszeichen geregelte Vorfahrt. Es kam zum Unfall.', 'Vorfahrt missachtet (Zeichen 205/206), mit Unfall', 'vorfahrt', 'gegner_klar', true, true, 12000, 1, 0),
('109600', '1', '§ 9 Abs. 1 StVO',   9, 'Sie bogen ab ohne auf den nachfolgenden Verkehr zu achten. Es kam zum Unfall.', 'Abbiegen ohne Rückschau, mit Unfall', 'abbiegen', 'gegner_wahrscheinlich', true, true, 14000, 1, 0),
('109605', '1', '§ 9 Abs. 3 StVO',   9, 'Sie bogen links ab und ließen den entgegenkommenden Verkehr nicht durchfahren. Es kam zum Unfall.', 'Links-Abbiegen ohne Vorfahrt beachtet, mit Unfall', 'abbiegen', 'gegner_klar', true, true, 14000, 1, 0),
('109610', '1', '§ 9 Abs. 5 StVO',   9, 'Sie fuhren rückwärts und gefährdeten anderen Verkehr. Es kam zum Unfall.', 'Rückwärtsfahren mit Gefährdung, mit Unfall', 'rueckwaerts_parken', 'gegner_wahrscheinlich', true, true, 8000, 1, 0),
('110600', '1', '§ 10 StVO',        10, 'Sie fuhren vom Fahrbahnrand an und gefährdeten anderen Verkehr. Es kam zum Unfall.', 'Anfahren vom Fahrbahnrand, mit Unfall', 'einfahren_anfahren', 'gegner_wahrscheinlich', true, true, 10000, 1, 0),
('114600', '1', '§ 14 Abs. 1 StVO', 14, 'Sie öffneten die Fahrzeugtür ohne auf andere Verkehrsteilnehmer zu achten. Es kam zum Unfall.', 'Dooring, mit Unfall', 'dooring', 'gegner_wahrscheinlich', true, true, 4000, 0, 0),
('411001', '4', '§ 24a Abs. 1 StVG', 24, 'Sie führten ein Kraftfahrzeug mit einer Blutalkoholkonzentration ab 0,5 Promille. Es kam zum Unfall.', 'Alkohol am Steuer (ab 0,5 Promille), mit Unfall', 'alkohol_drogen', 'gegner_klar', true, true, 100000, 2, 1),
('411101', '4', '§ 24a Abs. 2 StVG', 24, 'Sie führten ein Kraftfahrzeug unter Wirkung berauschender Mittel. Es kam zum Unfall.', 'Drogen am Steuer, mit Unfall', 'alkohol_drogen', 'gegner_klar', true, true, 100000, 2, 1),
('134600', '1', '§ 34 Abs. 1 StVO', 34, 'Sie entfernten sich unerlaubt vom Unfallort trotz Unfall mit Sach- oder Personenschaden.', 'Unerlaubtes Entfernen vom Unfallort (Fahrerflucht)', 'fahrerflucht', 'gegner_klar', true, true, 3500, 0, 0),
('132400', '1', '§ 37 Abs. 2 StVO', 37, 'Sie überfuhren bei Rot das Lichtzeichen. Es kam zum Unfall.', 'Rotlicht überfahren, mit Unfall', 'kreuzung_rotlicht', 'gegner_klar', true, true, 24000, 2, 1),
('132404', '1', '§ 37 Abs. 2 StVO', 37, 'Sie überfuhren bei Rot das Lichtzeichen mit einer Rotphase von mehr als einer Sekunde. Es kam zum Unfall.', 'Rotlicht > 1s überfahren, mit Unfall (qualifiziert)', 'kreuzung_rotlicht', 'gegner_klar', true, true, 36000, 2, 1),
('141313', '1', '§ 3 Abs. 3 StVO',   3, 'Sie überschritten außerhalb geschlossener Ortschaften die zulässige Höchstgeschwindigkeit um 21-25 km/h. Es kam zum Unfall.', 'Zu schnell außerorts (+21-25 km/h), mit Unfall', 'geschwindigkeit', 'gegner_wahrscheinlich', true, true, 12000, 1, 0),
('126600', '1', '§ 26 Abs. 1 StVO', 26, 'Sie näherten sich einem Fußgängerüberweg ohne erkennbar bremsbereit zu sein. Es kam zum Unfall mit einem Fußgänger.', 'Fußgängerüberweg nicht beachtet, mit Unfall', 'fussgaenger', 'gegner_klar', true, false, 10000, 1, 0),
('101600', '1', '§ 1 Abs. 2 StVO',   1, 'Sie verhielten sich im Straßenverkehr nicht so dass keine anderen Verkehrsteilnehmer gefährdet werden. Es kam zum Unfall.', 'Grundregeln StVO verletzt, mit Unfall', 'grundregeln', 'neutral', true, true, 3500, 0, 0),
('104605', '1', '§ 4 Abs. 3 StVO',   4, 'Sie hielten als Kraftfahrzeugführer den Sicherheitsabstand nicht ein und fuhren mit stark verzögertem Abstand. Es kam zum Unfall.', 'Zu dichtes Auffahren, mit Unfall (qualifiziert)', 'auffahrunfall', 'gegner_klar', true, true, 18000, 1, 0);
