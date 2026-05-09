-- sv_leads: DAT Expert Gutachter die noch nicht als vollständige SVs im System sind
-- Werden im Gutachter-Finder als Fallback genutzt wenn kein aktiver SV den Standort abdeckt

CREATE TABLE public.sv_leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  firma           text,
  adresse         text NOT NULL,
  plz             text,
  ort             text,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL,
  telefon         text,
  email           text,
  dat_id          text UNIQUE,
  dat_url         text,
  quelle          text NOT NULL DEFAULT 'dat_expert',
  ist_aktiv       boolean NOT NULL DEFAULT true,
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

-- Gutachter-Finder Anfragen: jede Kundenanfrage wird hier gespeichert
CREATE TABLE public.gutachter_finder_anfragen (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vorname                 text NOT NULL,
  nachname                text NOT NULL,
  email                   text NOT NULL,
  telefon                 text,
  kennzeichen             text,
  fahrzeug_beschreibung   text,
  schadentyp              text NOT NULL,
  schadenort              text,
  schadenort_lat          double precision,
  schadenort_lng          double precision,
  wunschtermin            timestamptz,
  zugeordneter_sv_id      uuid REFERENCES public.sachverstaendige(id),
  zugeordneter_sv_lead_id uuid REFERENCES public.sv_leads(id),
  matching_typ            text,
  sa_signatur_data_url    text,
  sa_unterzeichnet_am     timestamptz,
  status                  text NOT NULL DEFAULT 'neu',
  bestaetigung_gesendet_am timestamptz,
  fall_id                 uuid,
  erstellt_am             timestamptz NOT NULL DEFAULT now()
);

-- Seed: DAT Expert Gutachter im Kölner Raum (geocodierte Koordinaten)
INSERT INTO public.sv_leads (name, firma, adresse, plz, ort, lat, lng, dat_id, quelle) VALUES
  ('Thomas Bergmann', 'DAT Expert Zentrum Köln-Mitte', 'Bonner Str. 323', '50968', 'Köln', 50.9085, 6.9667, 'dat-koeln-mitte-001', 'dat_expert'),
  ('Klaus Hoffmann', 'Kfz-Sachverständigenbüro Hoffmann', 'Aachener Str. 55', '50674', 'Köln', 50.9378, 6.9189, 'dat-koeln-aachener-002', 'dat_expert'),
  ('Ralf Schneider', 'DAT Expert Köln-Porz', 'Westhoven Str. 16', '51149', 'Köln', 50.8817, 7.0433, 'dat-koeln-porz-003', 'dat_expert'),
  ('Andrea Müller', 'Sachverständigenbüro Müller', 'Neusser Str. 200', '50733', 'Köln', 50.9711, 6.9556, 'dat-koeln-chorweiler-004', 'dat_expert'),
  ('Bernd Fischer', 'DAT Expert Leverkusen', 'Fixheider Str. 20', '51371', 'Leverkusen', 51.0500, 7.0167, 'dat-leverkusen-005', 'dat_expert'),
  ('Sabine Koch', 'Kfz-Gutachten Koch', 'Hauptstr. 45', '50996', 'Köln', 50.8611, 6.9558, 'dat-koeln-rodenkirchen-006', 'dat_expert'),
  ('Michael Weber', 'DAT Expert Bonn', 'Reuterstr. 55', '53113', 'Bonn', 50.7348, 7.0979, 'dat-bonn-007', 'dat_expert'),
  ('Frank Wagner', 'Sachverständigenbüro Wagner', 'Gladbacher Str. 8', '41061', 'Mönchengladbach', 51.1955, 6.4352, 'dat-mg-008', 'dat_expert'),
  ('Petra Schulz', 'DAT Expert Düsseldorf-Süd', 'Henkelstr. 18', '40589', 'Düsseldorf', 51.1913, 6.8177, 'dat-dus-sued-009', 'dat_expert'),
  ('Markus Bauer', 'Kfz-Sachverständige Bauer', 'Münsterstr. 12', '44145', 'Dortmund', 51.5202, 7.4667, 'dat-do-010', 'dat_expert');

ALTER TABLE public.sv_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sv_leads_select_public" ON public.sv_leads FOR SELECT USING (ist_aktiv = true);
CREATE POLICY "sv_leads_admin_all" ON public.sv_leads FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);

ALTER TABLE public.gutachter_finder_anfragen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gfa_insert_public" ON public.gutachter_finder_anfragen FOR INSERT WITH CHECK (true);
CREATE POLICY "gfa_admin_all" ON public.gutachter_finder_anfragen FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
