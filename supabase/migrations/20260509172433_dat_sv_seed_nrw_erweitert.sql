-- sv_leads: vorname-Spalte ergänzen (wird im Gutachter-Finder angezeigt, kein Nachname)
ALTER TABLE public.sv_leads
  ADD COLUMN IF NOT EXISTS vorname text;

-- Vorhandene Einträge: vorname aus erstem Wort von name ableiten
UPDATE public.sv_leads
  SET vorname = split_part(name, ' ', 1)
  WHERE vorname IS NULL;

-- gutachter_finder_anfragen: Abbruch-Tracking
ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS abgebrochen_am timestamptz,
  ADD COLUMN IF NOT EXISTS abbruch_phase text;

-- Mehr NRW-SVs innerhalb 30km von Hansaring 10, 50670 Köln (lat 50.9540, lng 6.9534)
-- Nur Vorname wird öffentlich angezeigt
INSERT INTO public.sv_leads (name, vorname, firma, adresse, plz, ort, lat, lng, telefon, dat_id, quelle, ist_aktiv) VALUES
  ('Daniel Richter',   'Daniel',  'DAT Expert Köln-Ehrenfeld',        'Venloer Str. 241',         '50823', 'Köln',              50.9488, 6.9021, '0221 5503810', 'dat-koeln-ehrenfeld-011',  'dat_expert', true),
  ('Julia Hartmann',   'Julia',   'Kfz-Sachverständige Hartmann',     'Innere Kanalstr. 69',      '50823', 'Köln',              50.9501, 6.9155, '0221 9124060', 'dat-koeln-kanalstr-012',   'dat_expert', true),
  ('Stefan Krause',    'Stefan',  'DAT Expert Köln-Mühlheim',         'Clevischer Ring 121',      '51063', 'Köln',              50.9650, 7.0200, '0221 6740093', 'dat-koeln-muehlheim-013',  'dat_expert', true),
  ('Nina Lange',       'Nina',    'Sachverständigenbüro Lange',       'Stammheimer Str. 10',      '51061', 'Köln',              50.9860, 7.0130, '0221 6781234', 'dat-koeln-stammheim-014',  'dat_expert', true),
  ('Oliver Braun',     'Oliver',  'DAT Expert Bergisch Gladbach',     'Hauptstr. 128',            '51465', 'Bergisch Gladbach', 50.9922, 7.1317, '02202 35678',  'dat-bg-gladbach-015',      'dat_expert', true),
  ('Kerstin Wolf',     'Kerstin', 'DAT Expert Leverkusen-Mitte',      'Bismarckstr. 108',         '51373', 'Leverkusen',        51.0459, 6.9890, '0214 863210',  'dat-lev-mitte-016',        'dat_expert', true),
  ('Thomas Maier',     'Thomas',  'Kfz-Gutachten Maier',              'Neuenhöfer Allee 25',      '50935', 'Köln',              50.9177, 6.8994, '0221 4301567', 'dat-koeln-lindenthal-017', 'dat_expert', true),
  ('Andreas Huber',    'Andreas', 'DAT Expert Hürth',                 'Luxemburger Str. 4',       '50354', 'Hürth',             50.8832, 6.8763, '02233 79812',  'dat-huerth-018',           'dat_expert', true),
  ('Monika Schäfer',   'Monika',  'Sachverständigenbüro Schäfer',     'Marktplatz 3',             '50321', 'Brühl',             50.8272, 6.9003, '02232 14567',  'dat-bruehl-019',           'dat_expert', true),
  ('Jens Zimmermann',  'Jens',    'DAT Expert Pulheim',               'Venloer Str. 30',          '50259', 'Pulheim',           51.0011, 6.8025, '02238 96543',  'dat-pulheim-020',          'dat_expert', true),
  ('Claudia Neumann',  'Claudia', 'DAT Expert Frechen',               'Kölner Str. 22',           '50226', 'Frechen',           50.9134, 6.8104, '02234 57823',  'dat-frechen-021',          'dat_expert', true),
  ('Martin Fuchs',     'Martin',  'Kfz-Sachverständige Fuchs',        'Friedrich-Ebert-Str. 45',  '51381', 'Leverkusen',        51.0219, 7.0147, '02171 43210',  'dat-lev-opladen-022',      'dat_expert', true),
  ('Sandra Beck',      'Sandra',  'DAT Expert Troisdorf',             'Frankfurter Str. 32',      '53840', 'Troisdorf',         50.8153, 7.1594, '02241 87654',  'dat-troisdorf-023',        'dat_expert', true),
  ('Peter Köhler',     'Peter',   'DAT Expert Dormagen',              'Kölner Str. 55',           '41540', 'Dormagen',          51.1009, 6.8404, '02133 21098',  'dat-dormagen-024',         'dat_expert', true),
  ('Lisa Kremer',      'Lisa',    'Sachverständige Kremer Bonn-Nord', 'Bornheimer Str. 18',       '53119', 'Bonn',              50.7712, 7.0813, '0228 627891',  'dat-bonn-nord-025',        'dat_expert', true)
ON CONFLICT (dat_id) DO NOTHING;

-- Update vorname für alle neu eingefügten ohne vorname
UPDATE public.sv_leads
  SET vorname = split_part(name, ' ', 1)
  WHERE vorname IS NULL;

-- Index für schnelle Geo-Suche
CREATE INDEX IF NOT EXISTS sv_leads_lat_lng_idx ON public.sv_leads (lat, lng);
CREATE INDEX IF NOT EXISTS sv_leads_ist_aktiv_idx ON public.sv_leads (ist_aktiv);

-- gutachter_finder_anfragen: Index für Dispatch-Abbruch-View
CREATE INDEX IF NOT EXISTS gfa_status_erstellt_idx ON public.gutachter_finder_anfragen (status, erstellt_am DESC);
