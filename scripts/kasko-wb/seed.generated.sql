-- GENERIERT von scripts/kasko-wb/generate-seed-sql.mjs aus scripts/kasko-wb/wissensbasis-2026-07-20.json
-- Quelle: CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026. Idempotent (Upserts), keine UUIDs, Rechtstraeger-FK per Name (versicherungen-Seed ist nicht versioniert).

-- ADAC Autoversicherung
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('adac-autoversicherung', 'ADAC Autoversicherung', 'optional', ARRAY['mit Werkstattbonus']::text[], ARRAY['(Mitglieder)']::text[],
  NULL, 'Der Zusatz „(Mitglieder)“ ändert nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 10)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'adac-autoversicherung' AND v.name = 'ADAC Autoversicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'adac-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattbonus', 'Basis mit Werkstattbonus', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'adac-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'adac-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattbonus', 'Komfort mit Werkstattbonus', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'adac-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'adac-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattbonus', 'Premium mit Werkstattbonus', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'adac-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('adac-autoversicherung', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'adac-autoversicherung'), '20 %', 'kuerzung_unbestimmt', 'Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter · für Leasing und Neuwagen nicht empfohlen', 'zertifizierte Partnerwerkstätten; Ersatzfahrzeug max. 7 Tage', NULL, 'adac.de (Magazin Werkstattbindung)')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- AdmiralDirekt
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('admiraldirekt', 'AdmiralDirekt', 'optional', ARRAY['mit Werkstattbonus']::text[], ARRAY['CHECK24-Sonderrabatt','Junge Fahrer','mit Vorkasse']::text[],
  'Vertriebsmarke (Risikoträger Itzehoer); kein eigener Rechtsträger in den Stammdaten.', 'Zusätze wie „CHECK24-Sonderrabatt“ oder „Junge Fahrer“ ändern nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 20)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattbonus', 'Basis mit Werkstattbonus', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattbonus', 'Komfort mit Werkstattbonus', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort smart', NULL, 'Komfort smart', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort smart', 'mit Werkstattbonus', 'Komfort smart mit Werkstattbonus', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattbonus', 'Premium mit Werkstattbonus', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium smart', NULL, 'Premium smart', false, 'keine', 'belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium smart', 'mit Werkstattbonus', 'Premium smart mit Werkstattbonus', true, 'voll', 'belegt', 100
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis mit Vorkasse', NULL, 'Basis mit Vorkasse', false, 'keine', 'belegt', 110
FROM public.kasko_versicherer_marken m WHERE m.slug = 'admiraldirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- AIG Europe
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('aig-europe', 'AIG Europe', 'keine', '{}'::text[], '{}'::text[],
  'Kein Werkstattbindungs-Tarif im Angebot. Rechtsträger in den Stammdaten unter dem Altnamen Chartis Europe S.A.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 30)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'aig-europe' AND v.name = 'Chartis Europe S.A.' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AIG Europe (Einzeltarif)', NULL, 'AIG Europe (Einzeltarif)', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'aig-europe'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Allianz
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('allianz', 'Allianz', 'optional', ARRAY['WerkstattBonus']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 40)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'allianz' AND v.name = 'Allianz Versicherungs-AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'WerkstattBonus', 'Komfort WerkstattBonus', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'WerkstattBonus', 'Premium WerkstattBonus', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('allianz', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'allianz'), '20 %', 'kuerzung_80', 'Kürzung der Erstattung auf 80 % bei Reparatur außerhalb des Partnernetzes.',
  'Vollkasko und Teilkasko inkl. Glas (Voraussetzung TK oder VK)', 'Haftpflichtschaden Dritter · Ausland', 'TÜV-/DEKRA-zertifizierte Allianz-Partnerwerkstätten; Glas: Carglass, Euromaster, junited, Wintec; Hol-/Bringservice, Reinigung, Ersatzwagen', 'Allianz-AKB WerkstattBonus', 'allianz.de/auto/kfz-versicherung/werkstattbindung')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Allianz Direct
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('allianz-direct', 'Allianz Direct', 'optional', ARRAY['mit Werkstattbindung']::text[], ARRAY['Vorkasse']::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 50)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'allianz-direct' AND v.name = 'Allianz Direct' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DIRECT', NULL, 'DIRECT', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz-direct'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DIRECT', 'mit Werkstattbindung', 'DIRECT mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz-direct'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DIRECT Plus', NULL, 'DIRECT Plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz-direct'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DIRECT Plus', 'mit Werkstattbindung', 'DIRECT Plus mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz-direct'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DIRECT Vorkasse', NULL, 'DIRECT Vorkasse', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'allianz-direct'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('allianz-direct', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'allianz-direct'), NULL, 'kuerzung_unbestimmt', 'Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'Allianz-Netz', NULL, 'CHECK24')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Alte Leipziger
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('alte-leipziger', 'Alte Leipziger', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 60)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'alte-leipziger' AND v.name = 'Alte Leipziger Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', NULL, 'Classic', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'alte-leipziger'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', 'mit Werkstattservice', 'Classic mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'alte-leipziger'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort', NULL, 'Comfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'alte-leipziger'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort', 'mit Werkstattservice', 'Comfort mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'alte-leipziger'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Compact', NULL, 'Compact', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'alte-leipziger'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Autosan
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('autosan', 'Autosan', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 70)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Serie', NULL, 'Serie', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'autosan'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Serie', 'mit Werkstattbindung', 'Serie mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'autosan'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'autosan'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattbindung', 'Komfort mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'autosan'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- AvD
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('avd', 'AvD', 'optional', ARRAY['mit Werkstattbindung']::text[], ARRAY['(Mitglieder)']::text[],
  '„Select“ ist bei AvD ein Linienname, kein Werkstattbindungs-Marker (anders als bei HUK).', 'Der Zusatz „(Mitglieder)“ ändert nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 80)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'avd'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattbindung', 'Komfort mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'avd'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus', NULL, 'Plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'avd'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus', 'mit Werkstattbindung', 'Plus mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'avd'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Select', NULL, 'Select', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'avd'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Select', 'mit Werkstattbindung', 'Select mit Werkstattbindung', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'avd'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- AXA
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('axa', 'AXA', 'optional', ARRAY['mit Werkstattservice']::text[], ARRAY['mit Extraschutz']::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 90)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'axa' AND v.name = 'AXA Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online S', NULL, 'easy mobil online S', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online S', 'mit Werkstattservice', 'easy mobil online S mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online S Plus', NULL, 'easy mobil online S Plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online S Plus', 'mit Werkstattservice', 'easy mobil online S Plus mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online M', NULL, 'easy mobil online M', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online M', 'mit Werkstattservice', 'easy mobil online M mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online L', NULL, 'easy mobil online L', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online L', 'mit Werkstattservice', 'easy mobil online L mit Werkstattservice', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online', NULL, 'easy mobil online', false, 'keine', 'belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'easy mobil online mit Extraschutz', NULL, 'easy mobil online mit Extraschutz', false, 'keine', 'belegt', 100
FROM public.kasko_versicherer_marken m WHERE m.slug = 'axa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('axa', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'axa'), '„attraktiver Nachlass“ (Höhe nicht belegt)', 'kuerzung_80', 'Karosserie/Lack: Kürzung auf 80 %; Glas: zusätzliche Selbstbeteiligung von 300 €.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'ca. 3.000 DEKRA-geprüfte Partner; Glas über Innovation Group, riparo', 'AXA-AKB Werkstattservice', 'axa.de; jdcnews.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Barmenia Direkt
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('barmenia-direkt', 'Barmenia Direkt', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 100)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'barmenia-direkt' AND v.name = 'Barmenia Allgemeine Versicherungs-AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis-Schutz', NULL, 'Basis-Schutz', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmenia-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis-Schutz', 'mit Werkstattservice', 'Basis-Schutz mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmenia-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Top-Schutz', NULL, 'Top-Schutz', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmenia-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Top-Schutz', 'mit Werkstattservice', 'Top-Schutz mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmenia-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium-Schutz', NULL, 'Premium-Schutz', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmenia-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium-Schutz', 'mit Werkstattservice', 'Premium-Schutz mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmenia-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium Plus-Schutz', NULL, 'Premium Plus-Schutz', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmenia-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium Plus-Schutz', 'mit Werkstattservice', 'Premium Plus-Schutz mit Werkstattservice', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmenia-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- BarmeniaGothaer
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('barmeniagothaer', 'BarmeniaGothaer', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  'Zweiter Rechtsträger: Barmenia Allgemeine Versicherungs-AG.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 110)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'barmeniagothaer' AND v.name = 'Gothaer Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Privat', NULL, 'Privat', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmeniagothaer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Privat', 'mit Werkstattservice', 'Privat mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmeniagothaer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Privat Top-Schutz', NULL, 'Privat Top-Schutz', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmeniagothaer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Privat Top-Schutz', 'mit Werkstattservice', 'Privat Top-Schutz mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmeniagothaer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Privat Premium-Schutz', NULL, 'Privat Premium-Schutz', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmeniagothaer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Privat Premium-Schutz', 'mit Werkstattservice', 'Privat Premium-Schutz mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'barmeniagothaer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('barmeniagothaer', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'barmeniagothaer'), NULL, 'kuerzung_unbestimmt', 'Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', '„Die Partnerwerkstatt“ (HUK-Netz)', NULL, 'CHECK24; handwerk-magazin.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- BavariaDirekt
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('bavariadirekt', 'BavariaDirekt', 'optional', ARRAY['mit Werkstattbindung']::text[], ARRAY['Elektro Paket','Youngtimer','Vorkasse']::text[],
  NULL, 'Zusätze „Elektro Paket“, „Youngtimer“ oder „Vorkasse“ ändern nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 120)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort S online', NULL, 'Komfort S online', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariadirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort S online', 'mit Werkstattbindung', 'Komfort S online mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariadirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort M online', NULL, 'Komfort M online', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariadirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort M online', 'mit Werkstattbindung', 'Komfort M online mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariadirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort M Plus online', NULL, 'Komfort M Plus online', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariadirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort M Plus online', 'mit Werkstattbindung', 'Komfort M Plus online mit Werkstattbindung', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariadirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort L online', NULL, 'Komfort L online', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariadirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort L online', 'mit Werkstattbindung', 'Komfort L online mit Werkstattbindung', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariadirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('bavariadirekt', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'bavariadirekt'), NULL, 'kuerzung_80', 'Kürzung auf 80 %, mindestens 100 € zusätzliche Selbstbeteiligung (AKB Stand 30.09.2015); bei fiktiver Abrechnung laut LG Hildesheim 3 S 12/20 unwirksam.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'Partnernetz', 'A.2.5.2.5.1 / A.2.5.2.5.2', 'bavariadirekt.de (AKB-PDF); von-boehn.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- BavariaProtect
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('bavariaprotect', 'BavariaProtect', 'optional', ARRAY['mit Werkstattbindung']::text[], ARRAY['Elektro Paket']::text[],
  NULL, 'Der Zusatz „Elektro Paket“ ändert nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 130)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort S online', NULL, 'Komfort S online', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariaprotect'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort S online', 'mit Werkstattbindung', 'Komfort S online mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariaprotect'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort M online', NULL, 'Komfort M online', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariaprotect'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort M online', 'mit Werkstattbindung', 'Komfort M online mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariaprotect'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort M Plus online', NULL, 'Komfort M Plus online', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariaprotect'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort M Plus online', 'mit Werkstattbindung', 'Komfort M Plus online mit Werkstattbindung', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariaprotect'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort L online', NULL, 'Komfort L online', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariaprotect'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort L online', 'mit Werkstattbindung', 'Komfort L online mit Werkstattbindung', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bavariaprotect'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('bavariaprotect', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'bavariaprotect'), NULL, 'kuerzung_80', 'Kürzung auf 80 %, mindestens 100 € zusätzliche Selbstbeteiligung (AKB-Systematik BavariaDirekt).',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'Partnernetz', 'A.2.5.2.5.1 / A.2.5.2.5.2', 'bavariadirekt.de (AKB-PDF)')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- BGV / Badische Versicherungen
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('bgv', 'BGV / Badische Versicherungen', 'optional', ARRAY['mit Schadenservice Plus']::text[], ARRAY['Elektro Plus']::text[],
  'Bindungscharakter aus der Bezeichnung abgeleitet – AKB prüfen. Zweiter Rechtsträger: Badische Allgemeine Versicherung AG.', 'Der Zusatz „Elektro Plus“ ändert nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 140)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'bgv' AND v.name = 'Badischer Gemeinde-Versicherungs-Verband' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'abgeleitet', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Schadenservice Plus', 'Basis mit Schadenservice Plus', true, 'voll', 'abgeleitet', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik', NULL, 'Klassik', false, 'keine', 'abgeleitet', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik', 'mit Schadenservice Plus', 'Klassik mit Schadenservice Plus', true, 'voll', 'abgeleitet', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Exklusiv', NULL, 'Exklusiv', false, 'keine', 'abgeleitet', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Exklusiv', 'mit Schadenservice Plus', 'Exklusiv mit Schadenservice Plus', true, 'voll', 'abgeleitet', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'bgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Concordia
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('concordia', 'Concordia', 'optional', ARRAY['Partner']::text[], ARRAY['VollkaskoPlus','oecodrive']::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 150)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'concordia' AND v.name = 'Concordia Versicherungs-Gesellschaft a.G.' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'concordia'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'Partner', 'Premium Partner', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'concordia'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium VollkaskoPlus', NULL, 'Premium VollkaskoPlus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'concordia'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium VollkaskoPlus', 'Partner', 'Premium VollkaskoPlus Partner', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'concordia'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', NULL, 'Classic', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'concordia'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium oecodrive', NULL, 'Premium oecodrive', false, 'keine', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'concordia'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium VollkaskoPlus oecodrive', NULL, 'Premium VollkaskoPlus oecodrive', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'concordia'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- CosmosDirekt
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('cosmosdirekt', 'CosmosDirekt', 'optional', ARRAY['mit Werkstattbindung']::text[], ARRAY['inkl. Verkehrsrechtsschutz']::text[],
  'Basis: frühere Recherche nannte die Werkstattbindung im Basis als Pflicht; CHECK24 listet Basis auch ohne – AKB prüfen.', 'Der Zusatz „inkl. Verkehrsrechtsschutz“ ändert nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 160)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'cosmosdirekt' AND v.name = 'Cosmos Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'cosmosdirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattbindung', 'Basis mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'cosmosdirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort', NULL, 'Comfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'cosmosdirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort', 'mit Werkstattbindung', 'Comfort mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'cosmosdirekt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('cosmosdirekt', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'cosmosdirekt'), NULL, 'deckelung', 'Erstattung nur bis zur Höhe der Kosten, die in der Partnerwerkstatt angefallen wären.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'DEKRA-Netz (Generali/Cosmos)', NULL, 'cosmosdirekt.de; CHECK24')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- DA Direkt
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('da-direkt', 'DA Direkt', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 170)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'da-direkt' AND v.name = 'DA Deutsche Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattbindung', 'Basis mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort Smart', NULL, 'Komfort Smart', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort Smart', 'mit Werkstattbindung', 'Komfort Smart mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattbindung', 'Komfort mit Werkstattbindung', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattbindung', 'Premium mit Werkstattbindung', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort Plus', NULL, 'Komfort Plus', false, 'keine', 'belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'da-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- DBV
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('dbv', 'DBV', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  'AXA-Gruppe (Systematik wie AXA Werkstattservice).', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 180)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'dbv' AND v.name = 'DBV Deutsche Beamten-Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'mobil kompakt Online', NULL, 'mobil kompakt Online', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dbv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'mobil kompakt Online', 'mit Werkstattservice', 'mobil kompakt Online mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dbv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'mobil komfort Online', NULL, 'mobil komfort Online', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dbv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'mobil komfort Online', 'mit Werkstattservice', 'mobil komfort Online mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dbv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'mobil komfort Premium Online', NULL, 'mobil komfort Premium Online', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dbv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'mobil komfort Premium Online', 'mit Werkstattservice', 'mobil komfort Premium Online mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dbv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('dbv', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'dbv'), '„attraktiver Nachlass“ (Höhe nicht belegt)', 'kuerzung_80', 'Karosserie/Lack: Kürzung auf 80 %; Glas: zusätzliche Selbstbeteiligung von 300 € (AXA-Systematik).',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'ca. 3.000 DEKRA-geprüfte Partner; Glas über Innovation Group, riparo', 'AXA-AKB Werkstattservice', 'axa.de; jdcnews.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Debeka
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('debeka', 'Debeka', 'optional', ARRAY['mit Unfallreparatur-Service']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 190)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'debeka' AND v.name = 'Debeka Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort', NULL, 'Comfort', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'debeka'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort', 'mit Unfallreparatur-Service', 'Comfort mit Unfallreparatur-Service', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'debeka'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort Plus', NULL, 'Comfort Plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'debeka'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort Plus', 'mit Unfallreparatur-Service', 'Comfort Plus mit Unfallreparatur-Service', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'debeka'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('debeka', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'debeka'), NULL, 'kuerzung_unbestimmt', 'Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', '„Die Partnerwerkstatt“ (HUK-Netz)', NULL, 'CHECK24; handwerk-magazin.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- DEVK
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('devk', 'DEVK', 'optional', ARRAY['Kasko-Mobil']::text[], ARRAY['ACV Mitglieder','Vorkasse']::text[],
  NULL, 'Zusätze „ACV Mitglieder“ oder „Vorkasse“ ändern nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 200)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'devk' AND v.name = 'DEVK Allgemeine Versicherungs-AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis-Schutz', NULL, 'Basis-Schutz', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis-Schutz', 'Kasko-Mobil', 'Basis-Schutz Kasko-Mobil', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort-Schutz', NULL, 'Komfort-Schutz', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort-Schutz', 'Kasko-Mobil', 'Komfort-Schutz Kasko-Mobil', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium-Schutz', NULL, 'Premium-Schutz', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium-Schutz', 'Kasko-Mobil', 'Premium-Schutz Kasko-Mobil', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DEVK Eisenbahn Basis', NULL, 'DEVK Eisenbahn Basis', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DEVK Eisenbahn Basis', 'Kasko-Mobil', 'DEVK Eisenbahn Basis Kasko-Mobil', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DEVK Eisenbahn Komfort', NULL, 'DEVK Eisenbahn Komfort', false, 'keine', 'belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DEVK Eisenbahn Komfort', 'Kasko-Mobil', 'DEVK Eisenbahn Komfort Kasko-Mobil', true, 'voll', 'belegt', 100
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DEVK Eisenbahn Premium', NULL, 'DEVK Eisenbahn Premium', false, 'keine', 'belegt', 110
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'DEVK Eisenbahn Premium', 'Kasko-Mobil', 'DEVK Eisenbahn Premium Kasko-Mobil', true, 'voll', 'belegt', 120
FROM public.kasko_versicherer_marken m WHERE m.slug = 'devk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('devk', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'devk'), 'bis 20 % (Werbung; Website laut Recherche „bis 13 %“ – Stand prüfen)', 'kuerzung_85', 'Kürzung um 15 %, mindestens 300 € zusätzliche Selbstbeteiligung.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter · bestimmte Hersteller-/Leasingfahrzeuge ausgeschlossen', 'über 4.000 Partnerbetriebe (ca. 70 % markengebunden); Glas: A.T.U., Carglass, junited, Wintec, Nobleglass; Hol-/Bringservice, Ersatzfahrzeug', 'DEVK-AKB Kasko-Mobil', 'devk.de; sdrive-gutachter.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Dialog
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('dialog', 'Dialog', 'optional', ARRAY['WerkstattservicePLUS']::text[], ARRAY['VollkaskoPLUS']::text[],
  'Generali-Gruppe; kein eigener Rechtsträger in den Stammdaten.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 210)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dialog'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'WerkstattservicePLUS', 'Premium WerkstattservicePLUS', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dialog'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium VollkaskoPLUS', NULL, 'Premium VollkaskoPLUS', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dialog'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium VollkaskoPLUS', 'WerkstattservicePLUS', 'Premium VollkaskoPLUS WerkstattservicePLUS', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'dialog'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Die Bayerische
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('die-bayerische', 'Die Bayerische', 'optional', ARRAY['mit Werkstattservice']::text[], ARRAY['E-Drive']::text[],
  NULL, 'Der Zusatz „E-Drive“ ändert nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 220)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'die-bayerische' AND v.name = 'Bayerische Beamten Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Smart', NULL, 'Smart', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-bayerische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Smart', 'mit Werkstattservice', 'Smart mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-bayerische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-bayerische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattservice', 'Komfort mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-bayerische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Prestige', NULL, 'Prestige', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-bayerische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Prestige', 'mit Werkstattservice', 'Prestige mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-bayerische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Die Continentale
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('die-continentale', 'Die Continentale', 'optional', ARRAY['Sorglos-Kasko']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 230)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'die-continentale' AND v.name = 'Continentale Sachversicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-continentale'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Sorglos-Kasko', 'Basis Sorglos-Kasko', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-continentale'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-continentale'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'Sorglos-Kasko', 'Komfort Sorglos-Kasko', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-continentale'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Die Lippische
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('die-lippische', 'Die Lippische', 'optional', ARRAY['Werkstattservice']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 240)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'die-lippische' AND v.name = 'Lippische Landesbrandversicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoBasis', NULL, 'AutoBasis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-lippische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoBasis', 'Werkstattservice', 'AutoBasis Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-lippische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlus', NULL, 'AutoPlus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-lippische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlus', 'Werkstattservice', 'AutoPlus Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'die-lippische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- ERGO
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('ergo', 'ERGO', 'optional', ARRAY['mit Werkstattbonus']::text[], ARRAY['Wertschutz24','Wertschutz36','ErsatzfahrzeugPlus']::text[],
  NULL, 'Zusätze „mit Wertschutz24/36“ oder „ErsatzfahrzeugPlus“ ändern nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 250)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'ergo' AND v.name = 'ERGO Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Smart', NULL, 'Smart', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'ergo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Smart', 'mit Werkstattbonus', 'Smart mit Werkstattbonus', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'ergo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Best', NULL, 'Best', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'ergo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Best', 'mit Werkstattbonus', 'Best mit Werkstattbonus', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'ergo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('ergo', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'ergo'), '10 %', 'kuerzung_unbestimmt', 'Kürzung der Erstattung; der Selbstbeteiligungs-Vorteil entfällt.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'ERGO Premium-Partnerwerkstätten', NULL, 'ergo.de; CHECK24')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Europa
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('europa', 'Europa', 'optional', ARRAY['Spar-Kasko']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 260)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'europa' AND v.name = 'EUROPA Sachversicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'europa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Spar-Kasko', 'Basis Spar-Kasko', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'europa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'europa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'Spar-Kasko', 'Komfort Spar-Kasko', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'europa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- EUROPA-go
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('europa-go', 'EUROPA-go', 'optional', ARRAY['Spar-Kasko']::text[], '{}'::text[],
  'Online-Marke der EUROPA.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 270)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'europa-go' AND v.name = 'EUROPA Sachversicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'europa-go'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Spar-Kasko', 'Basis Spar-Kasko', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'europa-go'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'europa-go'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'Spar-Kasko', 'Komfort Spar-Kasko', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'europa-go'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Fahrlehrerversicherung
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('fahrlehrerversicherung', 'Fahrlehrerversicherung', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 280)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'fahrlehrerversicherung' AND v.name = 'Fahrlehrerversicherung VaG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'B-Tarif Basis', NULL, 'B-Tarif Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'B-Tarif Basis', 'mit Werkstattbindung', 'B-Tarif Basis mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'B-Tarif Komfort', NULL, 'B-Tarif Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'B-Tarif Komfort', 'mit Werkstattbindung', 'B-Tarif Komfort mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'B-Tarif Premium', NULL, 'B-Tarif Premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'B-Tarif Premium', 'mit Werkstattbindung', 'B-Tarif Premium mit Werkstattbindung', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'P-Tarif Basis', NULL, 'P-Tarif Basis', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'P-Tarif Basis', 'mit Werkstattbindung', 'P-Tarif Basis mit Werkstattbindung', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'P-Tarif Komfort', NULL, 'P-Tarif Komfort', false, 'keine', 'belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'P-Tarif Komfort', 'mit Werkstattbindung', 'P-Tarif Komfort mit Werkstattbindung', true, 'voll', 'belegt', 100
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'P-Tarif Premium', NULL, 'P-Tarif Premium', false, 'keine', 'belegt', 110
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'P-Tarif Premium', 'mit Werkstattbindung', 'P-Tarif Premium mit Werkstattbindung', true, 'voll', 'belegt', 120
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'X-Tarif Basis', NULL, 'X-Tarif Basis', false, 'keine', 'belegt', 130
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'X-Tarif Basis', 'mit Werkstattbindung', 'X-Tarif Basis mit Werkstattbindung', true, 'voll', 'belegt', 140
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'X-Tarif Komfort', NULL, 'X-Tarif Komfort', false, 'keine', 'belegt', 150
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'X-Tarif Komfort', 'mit Werkstattbindung', 'X-Tarif Komfort mit Werkstattbindung', true, 'voll', 'belegt', 160
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'X-Tarif Premium', NULL, 'X-Tarif Premium', false, 'keine', 'belegt', 170
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'X-Tarif Premium', 'mit Werkstattbindung', 'X-Tarif Premium mit Werkstattbindung', true, 'voll', 'belegt', 180
FROM public.kasko_versicherer_marken m WHERE m.slug = 'fahrlehrerversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Feuersozietät
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('feuersozietaet', 'Feuersozietät', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  'VKB-Gruppe.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 290)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'feuersozietaet' AND v.name = 'Feuersozietät Berlin Brandenburg Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario', NULL, 'Vario', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'feuersozietaet'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario', 'mit Werkstattservice', 'Vario mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'feuersozietaet'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario Kasko-Plus', NULL, 'Vario Kasko-Plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'feuersozietaet'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario Kasko-Plus', 'mit Werkstattservice', 'Vario Kasko-Plus mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'feuersozietaet'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario Kasko-Plus mit Elektro/Hybrid', NULL, 'Vario Kasko-Plus mit Elektro/Hybrid', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'feuersozietaet'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario Kasko-Plus mit Elektro/Hybrid', 'mit Werkstattservice', 'Vario Kasko-Plus mit Elektro/Hybrid mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'feuersozietaet'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Generali
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('generali', 'Generali', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 300)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'generali' AND v.name = 'Generali Deutschland Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Optimal', NULL, 'Optimal', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'generali'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Optimal', 'mit Werkstattbindung', 'Optimal mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'generali'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- GVV Direkt
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('gvv-direkt', 'GVV Direkt', 'optional', ARRAY['mit Werkstatt Direkt']::text[], ARRAY['Kasko PLUS']::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 310)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'gvv-direkt' AND v.name = 'GVV-Privatversicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', NULL, 'Classic', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'gvv-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', 'mit Werkstatt Direkt', 'Classic mit Werkstatt Direkt', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'gvv-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic Kasko PLUS', NULL, 'Classic Kasko PLUS', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'gvv-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic Kasko PLUS', 'mit Werkstatt Direkt', 'Classic Kasko PLUS mit Werkstatt Direkt', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'gvv-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'gvv-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- HanseMerkur
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('hansemerkur', 'HanseMerkur', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 320)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'hansemerkur' AND v.name = 'HanseMerkur Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Drive Easy', NULL, 'Drive Easy', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'hansemerkur'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Drive Easy', 'mit Werkstattbindung', 'Drive Easy mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'hansemerkur'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Drive Best', NULL, 'Drive Best', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'hansemerkur'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Drive Best', 'mit Werkstattbindung', 'Drive Best mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'hansemerkur'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Drive Smart', NULL, 'Drive Smart', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'hansemerkur'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Helvetia Baloise
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('helvetia-baloise', 'Helvetia Baloise', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  'Zweiter Rechtsträger: Baloise Sachversicherung AG Deutschland.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 330)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'helvetia-baloise' AND v.name = 'Helvetia Schweizerische Versicherungsgesellschaft AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'helvetia-baloise'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattservice', 'Basis mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'helvetia-baloise'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'All-in', NULL, 'All-in', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'helvetia-baloise'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'All-in', 'mit Werkstattservice', 'All-in mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'helvetia-baloise'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- HUK-COBURG
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('huk-coburg', 'HUK-COBURG', 'optional', ARRAY['SELECT','Kasko SELECT']::text[], ARRAY['Kasko PLUS']::text[],
  'Zweiter Rechtsträger: HUK-COBURG Haftpflicht-Unterstützungs-Kasse (öffentlicher Dienst).', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 340)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'huk-coburg' AND v.name = 'HUK-COBURG-Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk-coburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'SELECT', 'Basis SELECT', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk-coburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', NULL, 'Classic', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk-coburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', 'SELECT', 'Classic SELECT', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk-coburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic Kasko PLUS', NULL, 'Classic Kasko PLUS', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk-coburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic Kasko PLUS', 'SELECT', 'Classic Kasko PLUS SELECT', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk-coburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('huk-coburg', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'huk-coburg'), 'bis 20 %', 'vollverweigerung', 'Altverträge: Kürzung auf 85 %. Verträge ab 2014: Die Erstattung kann vollständig verweigert werden (laut Fachpresse und Anwaltsberichten – am konkreten AKB-Stand prüfen); gilt auch bei fiktiver Abrechnung.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter · Notfall im Ausland', '„Die Partnerwerkstatt“, über 1.800 Betriebe (DEKRA-geprüft); Glas: Carglass', 'HUK-AKB Kasko SELECT (versionsabhängig)', 'huk.de; kfz-betrieb (Vogel); Versicherungsbote')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- HUK24
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('huk24', 'HUK24', 'optional', ARRAY['SELECT','Kasko SELECT']::text[], ARRAY['Kasko PLUS']::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 350)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'huk24' AND v.name = 'HUK24 AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk24'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'SELECT', 'Basis SELECT', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk24'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', NULL, 'Classic', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk24'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', 'SELECT', 'Classic SELECT', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk24'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic Kasko PLUS', NULL, 'Classic Kasko PLUS', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk24'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic Kasko PLUS', 'SELECT', 'Classic Kasko PLUS SELECT', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk24'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('huk24', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'huk24'), 'bis 20 %', 'vollverweigerung', 'Altverträge: Kürzung auf 85 %. Verträge ab 2014: Die Erstattung kann vollständig verweigert werden (laut Fachpresse und Anwaltsberichten – am konkreten AKB-Stand prüfen); gilt auch bei fiktiver Abrechnung.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter · Notfall im Ausland', '„Die Partnerwerkstatt“, über 1.800 Betriebe (DEKRA-geprüft); Glas: Carglass', 'HUK-AKB Kasko SELECT (versionsabhängig)', 'huk.de; kfz-betrieb (Vogel); Versicherungsbote')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Inshared
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('inshared', 'Inshared', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  'Achmea-Gruppe; kein eigener Rechtsträger in den Stammdaten.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 360)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung', NULL, 'Kfz-Versicherung', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'inshared'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung', 'mit Werkstattbindung', 'Kfz-Versicherung mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'inshared'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung mit Auslandsschadenschutz', NULL, 'Kfz-Versicherung mit Auslandsschadenschutz', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'inshared'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung mit Auslandsschadenschutz', 'mit Werkstattbindung', 'Kfz-Versicherung mit Auslandsschadenschutz mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'inshared'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Itzehoer
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('itzehoer', 'Itzehoer', 'optional', ARRAY['mit Werkstattbonus']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 370)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'itzehoer' AND v.name = 'Itzehoer Versicherung Brandgilde von 1691 VVaG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort Drive', NULL, 'Comfort Drive', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'itzehoer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Comfort Drive', 'mit Werkstattbonus', 'Comfort Drive mit Werkstattbonus', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'itzehoer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'TopDrive', NULL, 'TopDrive', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'itzehoer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'TopDrive', 'mit Werkstattbonus', 'TopDrive mit Werkstattbonus', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'itzehoer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Janitos
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('janitos', 'Janitos', 'optional', ARRAY['mit Werkstatt-Management']::text[], '{}'::text[],
  'HDI-Gruppe; kein eigener Rechtsträger in den Stammdaten.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 380)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Compact', NULL, 'Compact', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'janitos'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Compact', 'mit Werkstatt-Management', 'Compact mit Werkstatt-Management', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'janitos'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Advanced', NULL, 'Advanced', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'janitos'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Advanced', 'mit Werkstatt-Management', 'Advanced mit Werkstatt-Management', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'janitos'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- KRAVAG
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('kravag', 'KRAVAG', 'optional', ARRAY['mit Werkstattservice','Glas']::text[], ARRAY['Kasko Spezial','BleibMobil']::text[],
  '„Glas“-Varianten vermutlich reine Glas-Bindung – nicht belegt, AKB prüfen. „Kasko Spezial“ und „BleibMobil“ sind keine Bindungs-Marker.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 390)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'kravag' AND v.name = 'KRAVAG-ALLGEMEINE Versicherungs-AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Kompakt', NULL, 'KfzPolice Kompakt', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Kompakt', 'mit Werkstattservice', 'KfzPolice Kompakt mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Kompakt', 'Glas', 'KfzPolice Kompakt Glas', true, 'nur_glas', 'nicht_belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Kompakt BleibMobil', NULL, 'KfzPolice Kompakt BleibMobil', false, 'keine', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Kompakt BleibMobil', 'mit Werkstattservice', 'KfzPolice Kompakt BleibMobil mit Werkstattservice', true, 'voll', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Kompakt BleibMobil', 'Glas', 'KfzPolice Kompakt BleibMobil Glas', true, 'nur_glas', 'nicht_belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv', NULL, 'KfzPolice Exklusiv', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv', 'mit Werkstattservice', 'KfzPolice Exklusiv mit Werkstattservice', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv', 'Glas', 'KfzPolice Exklusiv Glas', true, 'nur_glas', 'nicht_belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv BleibMobil', NULL, 'KfzPolice Exklusiv BleibMobil', false, 'keine', 'belegt', 100
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv BleibMobil', 'mit Werkstattservice', 'KfzPolice Exklusiv BleibMobil mit Werkstattservice', true, 'voll', 'belegt', 110
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv BleibMobil', 'Glas', 'KfzPolice Exklusiv BleibMobil Glas', true, 'nur_glas', 'nicht_belegt', 120
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv Kasko Spezial', NULL, 'KfzPolice Exklusiv Kasko Spezial', false, 'keine', 'belegt', 130
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv Kasko Spezial', 'mit Werkstattservice', 'KfzPolice Exklusiv Kasko Spezial mit Werkstattservice', true, 'voll', 'belegt', 140
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice Exklusiv Kasko Spezial', 'Glas', 'KfzPolice Exklusiv Kasko Spezial Glas', true, 'nur_glas', 'nicht_belegt', 150
FROM public.kasko_versicherer_marken m WHERE m.slug = 'kravag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('kravag', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'kravag'), NULL, 'kuerzung_85', 'Glas: Kürzung auf 85 % bei Reparatur außerhalb des Netzes; übrige Schäden nicht belegt.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'R+V-Partnernetz (Innovation Group)', NULL, 'CHECK24; autoglaser.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- LVM
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('lvm', 'LVM', 'keine', '{}'::text[], ARRAY['mit LVM-SchadenService']::text[],
  '„mit LVM-SchadenService“ ist ein Steuerungsangebot, keine belegte vertragliche Bindung; LVM wirbt mit freier Werkstattwahl.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 400)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'lvm' AND v.name = 'LVM Landwirtschaftlicher Versicherungsverein Münster a.G.' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlus', NULL, 'AutoPlus', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'lvm'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlus mit LVM-SchadenService', NULL, 'AutoPlus mit LVM-SchadenService', false, 'keine', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'lvm'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('lvm', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'lvm'), NULL, 'keine', 'Keine Werkstattbindung. Der LVM-SchadenService ist eine freiwillige Steuerung in eine Partnerwerkstatt (Abholung, Ersatzwagen, Reinigung).',
  NULL, NULL, 'LVM-Partnerwerkstätten (Steuerungsquote über 25 %, 2021)', NULL, 'lvm.de; schaden.news 06.07.2022')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Mannheimer
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('mannheimer', 'Mannheimer', 'keine', '{}'::text[], '{}'::text[],
  'Kein Werkstattbindungs-Tarif im Angebot.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 410)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'mannheimer' AND v.name = 'Mannheimer Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Maximos', NULL, 'Maximos', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'mannheimer'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Mecklenburgische
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('mecklenburgische', 'Mecklenburgische', 'optional', ARRAY['mit Partnerkasko']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 420)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'mecklenburgische' AND v.name = 'Mecklenburgische Versicherungs-Gesellschaft a.G.' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Grunddeckung', NULL, 'Grunddeckung', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'mecklenburgische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Grunddeckung', 'mit Partnerkasko', 'Grunddeckung mit Partnerkasko', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'mecklenburgische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfortdeckung', NULL, 'Komfortdeckung', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'mecklenburgische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfortdeckung', 'mit Partnerkasko', 'Komfortdeckung mit Partnerkasko', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'mecklenburgische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Münchener Verein
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('muenchener-verein', 'Münchener Verein', 'keine', '{}'::text[], '{}'::text[],
  'Kein Werkstattbindungs-Tarif im Angebot.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 430)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'muenchener-verein' AND v.name = 'Münchener Verein Allgemeine Versicherungs-AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Münchener Verein (Einzeltarif)', NULL, 'Münchener Verein (Einzeltarif)', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'muenchener-verein'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Neodigital
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('neodigital', 'Neodigital', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  '„NEO Select“ ist ein Linienname, kein Werkstattbindungs-Marker. Kein Rechtsträger in den Stammdaten.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 440)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'NEO M', NULL, 'NEO M', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'neodigital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'NEO M', 'mit Werkstattbindung', 'NEO M mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'neodigital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'NEO L', NULL, 'NEO L', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'neodigital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'NEO L', 'mit Werkstattbindung', 'NEO L mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'neodigital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'NEO Select', NULL, 'NEO Select', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'neodigital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'NEO Select', 'mit Werkstattbindung', 'NEO Select mit Werkstattbindung', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'neodigital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Öffentliche Braunschweig
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('oeffentliche-braunschweig', 'Öffentliche Braunschweig', 'optional', ARRAY['mit Werkstattservice Plus']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 450)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'oeffentliche-braunschweig' AND v.name = 'Öffentliche Versicherung Braunschweig' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-braunschweig'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattservice Plus', 'Basis mit Werkstattservice Plus', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-braunschweig'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-braunschweig'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattservice Plus', 'Komfort mit Werkstattservice Plus', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-braunschweig'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-braunschweig'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattservice Plus', 'Premium mit Werkstattservice Plus', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-braunschweig'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Öffentliche Oldenburg
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('oeffentliche-oldenburg', 'Öffentliche Oldenburg', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  'Basis ist nur als Werkstattbindungs-Variante gelistet.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 460)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'oeffentliche-oldenburg' AND v.name = 'Öffentliche Versicherung Oldenburg' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-oldenburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattservice', 'Komfort mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-oldenburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-oldenburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattservice', 'Premium mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-oldenburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattservice', 'Basis mit Werkstattservice', true, 'voll', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oeffentliche-oldenburg'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- ÖSA
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('oesa', 'ÖSA', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 470)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'oesa' AND v.name = 'Öffentliche Feuerversicherung Sachsen-Anhalt' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oesa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattservice', 'Basis mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oesa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oesa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattservice', 'Komfort mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oesa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oesa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattservice', 'Premium mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'oesa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Prokundo
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('prokundo', 'Prokundo', 'optional', ARRAY['mit Werkstatt-Service']::text[], '{}'::text[],
  'Kein Rechtsträger in den Stammdaten.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 480)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'EASY', NULL, 'EASY', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'prokundo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'EASY', 'mit Werkstatt-Service', 'EASY mit Werkstatt-Service', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'prokundo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'COMFORT', NULL, 'COMFORT', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'prokundo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'COMFORT', 'mit Werkstatt-Service', 'COMFORT mit Werkstatt-Service', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'prokundo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'BEST', NULL, 'BEST', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'prokundo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'BEST', 'mit Werkstatt-Service', 'BEST mit Werkstatt-Service', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'prokundo'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Provinzial
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('provinzial', 'Provinzial', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  'Zweiter Rechtsträger: Westfälische Provinzial Versicherung AG.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 490)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'provinzial' AND v.name = 'Provinzial Rheinland Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoBasis', NULL, 'AutoBasis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoBasis', 'mit Werkstattbindung', 'AutoBasis mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlus', NULL, 'AutoPlus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlus', 'mit Werkstattbindung', 'AutoPlus mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Provinzial', NULL, 'Provinzial', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Provinzial', 'mit Werkstattbindung', 'Provinzial mit Werkstattbindung', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus-Paket Haftpflicht', NULL, 'Plus-Paket Haftpflicht', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus-Paket Haftpflicht', 'mit Werkstattbindung', 'Plus-Paket Haftpflicht mit Werkstattbindung', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus-Paket Kasko', NULL, 'Plus-Paket Kasko', false, 'keine', 'belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus-Paket Kasko', 'mit Werkstattbindung', 'Plus-Paket Kasko mit Werkstattbindung', true, 'voll', 'belegt', 100
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus-Paket Kasko und Haftpflicht', NULL, 'Plus-Paket Kasko und Haftpflicht', false, 'keine', 'belegt', 110
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus-Paket Kasko und Haftpflicht', 'mit Werkstattbindung', 'Plus-Paket Kasko und Haftpflicht mit Werkstattbindung', true, 'voll', 'belegt', 120
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Provinzial Nord
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('provinzial-nord', 'Provinzial Nord', 'optional', ARRAY['mit Werkstattbindung']::text[], ARRAY['Plus-Paket']::text[],
  NULL, 'Zusätze „Plus-Paket Kfz-Haftpflicht/Kasko“ ändern nichts an der Werkstattwahl.', 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 500)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'provinzial-nord' AND v.name = 'Provinzial Nord Brandkasse AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Provinzial Nord', NULL, 'Provinzial Nord', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial-nord'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Provinzial Nord', 'mit Werkstattbindung', 'Provinzial Nord mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'provinzial-nord'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- R+V
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('r-plus-v', 'R+V', 'optional', ARRAY['mit Werkstattservice']::text[], ARRAY['Kasko Spezial']::text[],
  '„Kasko Spezial“ ist KEIN Bindungs-Marker – existiert mit und ohne Werkstattservice.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 510)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'r-plus-v' AND v.name = 'R+V Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice classic', NULL, 'KfzPolice classic', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'r-plus-v'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice classic', 'mit Werkstattservice', 'KfzPolice classic mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'r-plus-v'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice comfort', NULL, 'KfzPolice comfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'r-plus-v'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice comfort', 'mit Werkstattservice', 'KfzPolice comfort mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'r-plus-v'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice premium', NULL, 'KfzPolice premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'r-plus-v'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice premium', 'mit Werkstattservice', 'KfzPolice premium mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'r-plus-v'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice premium Kasko Spezial', NULL, 'KfzPolice premium Kasko Spezial', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'r-plus-v'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KfzPolice premium Kasko Spezial', 'mit Werkstattservice', 'KfzPolice premium Kasko Spezial mit Werkstattservice', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'r-plus-v'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('r-plus-v', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'r-plus-v'), NULL, 'kuerzung_85', 'Glas: Kürzung auf 85 % bei Reparatur außerhalb des Netzes; übrige Schäden nicht belegt.',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'R+V-Partnernetz (Innovation Group)', NULL, 'CHECK24; autoglaser.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- RheinLand
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('rheinland', 'RheinLand', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 520)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'rheinland' AND v.name = 'Rheinland Versicherungs AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Standard', NULL, 'Standard', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rheinland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Standard', 'mit Werkstattservice', 'Standard mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rheinland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus', NULL, 'Plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rheinland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus', 'mit Werkstattservice', 'Plus mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rheinland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rheinland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattservice', 'Premium mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rheinland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- rhion.digital
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('rhion-digital', 'rhion.digital', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  'Digitalmarke der RheinLand.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 530)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'rhion-digital' AND v.name = 'Rheinland Versicherungs AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Standard', NULL, 'Standard', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rhion-digital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Standard', 'mit Werkstattservice', 'Standard mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rhion-digital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus', NULL, 'Plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rhion-digital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Plus', 'mit Werkstattservice', 'Plus mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rhion-digital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rhion-digital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattservice', 'Premium mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'rhion-digital'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Saarland
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('saarland', 'Saarland', 'optional', ARRAY['mit Werkstatt Service']::text[], '{}'::text[],
  'VKB-Gruppe.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 540)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'saarland' AND v.name = 'Saarland Feuerversicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario', NULL, 'Vario', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'saarland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario', 'mit Werkstatt Service', 'Vario mit Werkstatt Service', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'saarland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario Kasko-Plus', NULL, 'Vario Kasko-Plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'saarland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario Kasko-Plus', 'mit Werkstatt Service', 'Vario Kasko-Plus mit Werkstatt Service', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'saarland'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Signal Iduna
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('signal-iduna', 'Signal Iduna', 'optional', ARRAY['Sorglos Kasko','Sorglos Kasko Glas']::text[], '{}'::text[],
  'Zwei Stufen: „Sorglos Kasko“ = Vollbindung, „Sorglos Kasko Glas“ = nur Glasschäden (Leasing-Variante).', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 550)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'signal-iduna' AND v.name = 'Signal Iduna Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'signal-iduna'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Sorglos Kasko', 'Basis Sorglos Kasko', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'signal-iduna'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Sorglos Kasko Glas', 'Basis Sorglos Kasko Glas', true, 'nur_glas', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'signal-iduna'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'signal-iduna'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'Sorglos Kasko', 'Premium Sorglos Kasko', true, 'voll', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'signal-iduna'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'Sorglos Kasko Glas', 'Premium Sorglos Kasko Glas', true, 'nur_glas', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'signal-iduna'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('signal-iduna', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'signal-iduna'), 'bis 15 %; Sorglos Kasko Glas bis 5 %', 'kuerzung_unbestimmt', 'Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).',
  'Sorglos Kasko: Vollkasko und Teilkasko inkl. Glas; Sorglos Kasko Glas: nur Glas', 'Haftpflichtschaden Dritter · für Leasing wird die Glas-Variante angeboten', 'Signal-Iduna-Partnerwerkstätten', NULL, 'signal-iduna.de; asscompact.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Sparkassen Direkt
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('sparkassen-direkt', 'Sparkassen Direkt', 'optional', ARRAY['mit Werkstattservice']::text[], ARRAY['Mobil','Vorkasse','(Sparkassenkunden)']::text[],
  'Vorkasse-Varianten ohne Werkstattbindung.', 'Zusätze „(Sparkassenkunden)“ oder „Vorkasse“ ändern nichts an der Werkstattwahl; „Mobil“ ist der Schutzbrief.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 560)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'sparkassen-direkt' AND v.name = 'Sparkassen DirektVersicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoBasis', NULL, 'AutoBasis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoBasis', 'mit Werkstattservice', 'AutoBasis mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoBasis Mobil', NULL, 'AutoBasis Mobil', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoBasis Mobil', 'mit Werkstattservice', 'AutoBasis Mobil mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlusProtect', NULL, 'AutoPlusProtect', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlusProtect', 'mit Werkstattservice', 'AutoPlusProtect mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlusProtect Mobil', NULL, 'AutoPlusProtect Mobil', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPlusProtect Mobil', 'mit Werkstattservice', 'AutoPlusProtect Mobil mit Werkstattservice', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPremium', NULL, 'AutoPremium', false, 'keine', 'belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPremium', 'mit Werkstattservice', 'AutoPremium mit Werkstattservice', true, 'voll', 'belegt', 100
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPremium Mobil', NULL, 'AutoPremium Mobil', false, 'keine', 'belegt', 110
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'AutoPremium Mobil', 'mit Werkstattservice', 'AutoPremium Mobil mit Werkstattservice', true, 'voll', 'belegt', 120
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sparkassen-direkt'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- SV Sachsen
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('sv-sachsen', 'SV Sachsen', 'optional', ARRAY['mit Werkstatt-Management']::text[], ARRAY['KaskoPlus']::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 570)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'sv-sachsen' AND v.name = 'Sparkassen-Versicherung Sachsen' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung', NULL, 'Kfz-Versicherung', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sv-sachsen'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung', 'mit Werkstatt-Management', 'Kfz-Versicherung mit Werkstatt-Management', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sv-sachsen'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung KaskoPlus', NULL, 'Kfz-Versicherung KaskoPlus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sv-sachsen'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung KaskoPlus', 'mit Werkstatt-Management', 'Kfz-Versicherung KaskoPlus mit Werkstatt-Management', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sv-sachsen'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- SV SparkassenVersicherung
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('sv-sparkassenversicherung', 'SV SparkassenVersicherung', 'optional', ARRAY['mit Werkstattbindung']::text[], ARRAY['Top-Schutz']::text[],
  'Stammdaten-Eintrag ist die Holding.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 580)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'sv-sparkassenversicherung' AND v.name = 'SV Sparkassen-Versicherung Holding AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung', NULL, 'Kfz-Versicherung', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sv-sparkassenversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung', 'mit Werkstattbindung', 'Kfz-Versicherung mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sv-sparkassenversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung Top-Schutz', NULL, 'Kfz-Versicherung Top-Schutz', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sv-sparkassenversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Kfz-Versicherung Top-Schutz', 'mit Werkstattbindung', 'Kfz-Versicherung Top-Schutz mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'sv-sparkassenversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- uniVersa
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('universa', 'uniVersa', 'optional', ARRAY['mit Werkstatt-Service']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 590)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'universa' AND v.name = 'UniVersa Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'FLEXXdrive', NULL, 'FLEXXdrive', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'universa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'FLEXXdrive', 'mit Werkstatt-Service', 'FLEXXdrive mit Werkstatt-Service', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'universa'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Versicherungskammer Bayern
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('versicherungskammer-bayern', 'Versicherungskammer Bayern', 'optional', ARRAY['mit Werkstattservice']::text[], ARRAY['KaskoPLUS']::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 600)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'versicherungskammer-bayern' AND v.name = 'Versicherungskammer Bayern' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario', NULL, 'Vario', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'versicherungskammer-bayern'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario', 'mit Werkstattservice', 'Vario mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'versicherungskammer-bayern'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario KaskoPLUS', NULL, 'Vario KaskoPLUS', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'versicherungskammer-bayern'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Vario KaskoPLUS', 'mit Werkstattservice', 'Vario KaskoPLUS mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'versicherungskammer-bayern'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Verti
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('verti', 'Verti', 'optional', ARRAY['Kasko Clever']::text[], ARRAY['Nix-Passiert','Vorkasse']::text[],
  NULL, 'Zusätze „Nix-Passiert“ oder „Vorkasse“ ändern nichts an der Werkstattwahl.', 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 610)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'verti' AND v.name = 'Verti Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Kasko Clever', 'Basis Kasko Clever', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Pur', NULL, 'Pur', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Pur', 'Kasko Clever', 'Pur Kasko Clever', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik', NULL, 'Klassik', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik', 'Kasko Clever', 'Klassik Kasko Clever', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'Kasko Clever', 'Premium Kasko Clever', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'PlusBONUS', NULL, 'PlusBONUS', false, 'keine', 'belegt', 90
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'PlusBONUS', 'Kasko Clever', 'PlusBONUS Kasko Clever', true, 'voll', 'belegt', 100
FROM public.kasko_versicherer_marken m WHERE m.slug = 'verti'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('verti', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'verti'), 'bis 15 %', 'deckelung', 'Erstattung nur bis zur Höhe der Kosten der nächstgelegenen Partnerwerkstatt.',
  'Vollkasko und Teilkasko (Glas ohne Hol-/Bringservice)', 'Haftpflichtschaden Dritter', 'Verti/MAPFRE-Netz', NULL, 'verti.de; CHECK24')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- VGH
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('vgh', 'VGH', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 620)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'vgh' AND v.name = 'VGH Landschaftliche Brandkasse Hannover' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vgh'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattservice', 'Basis mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vgh'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vgh'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattservice', 'Komfort mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vgh'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vgh'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattservice', 'Premium mit Werkstattservice', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vgh'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- VHV
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('vhv', 'VHV', 'optional', ARRAY['Schadenservice PLUS mit Werkstattservice']::text[], ARRAY['EXKLUSIV','mit gesetzlicher Mindestdeckung']::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 630)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'vhv' AND v.name = 'VHV Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik-Garant 2.0', NULL, 'Klassik-Garant 2.0', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vhv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik-Garant 2.0', 'Schadenservice PLUS mit Werkstattservice', 'Klassik-Garant 2.0 Schadenservice PLUS mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vhv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik-Garant 2.0 EXKLUSIV', NULL, 'Klassik-Garant 2.0 EXKLUSIV', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vhv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik-Garant 2.0 EXKLUSIV', 'Schadenservice PLUS mit Werkstattservice', 'Klassik-Garant 2.0 EXKLUSIV Schadenservice PLUS mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vhv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Klassik-Garant 2.0 mit gesetzlicher Mindestdeckung', NULL, 'Klassik-Garant 2.0 mit gesetzlicher Mindestdeckung', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vhv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('vhv', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'vhv'), '15 %', 'unbekannt', 'Kürzung bei Reparatur außerhalb des Netzes laut AKB (Höhe öffentlich nicht belegt).',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter', 'zertifizierte VHV-Partnerwerkstätten, Reparatur nach Herstellervorgaben; Zuweisung nur über die VHV-Steuerung', 'VHV-AKB Werkstattbindung', 'vhv.de/auto-versicherung/ratgeber/werkstattbindung')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- VÖDAG
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('voedag', 'VÖDAG', 'optional', ARRAY['Sorglos Kasko','Sorglos Kasko Glas']::text[], '{}'::text[],
  'Tarifsystematik identisch mit Signal Iduna. Kein Rechtsträger in den Stammdaten.', NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 640)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'voedag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Sorglos Kasko', 'Basis Sorglos Kasko', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'voedag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Sorglos Kasko Glas', 'Basis Sorglos Kasko Glas', true, 'nur_glas', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'voedag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'voedag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'Sorglos Kasko', 'Premium Sorglos Kasko', true, 'voll', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'voedag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'Sorglos Kasko Glas', 'Premium Sorglos Kasko Glas', true, 'nur_glas', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'voedag'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('voedag', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'voedag'), 'bis 15 %; Sorglos Kasko Glas bis 5 %', 'kuerzung_unbestimmt', 'Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).',
  'Sorglos Kasko: Vollkasko und Teilkasko inkl. Glas; Sorglos Kasko Glas: nur Glas', 'Haftpflichtschaden Dritter · für Leasing wird die Glas-Variante angeboten', 'Signal-Iduna-Partnerwerkstätten', NULL, 'signal-iduna.de; asscompact.de')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Volkswagen Autoversicherung
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('volkswagen-autoversicherung', 'Volkswagen Autoversicherung', 'standard', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  'Alle gelisteten Tarife ausschließlich als Werkstattbindungs-Varianten. Kein Rechtsträger in den Stammdaten.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 650)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattbindung', 'Basis mit Werkstattbindung', true, 'voll', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'volkswagen-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Optimal', 'mit Werkstattbindung', 'Optimal mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'volkswagen-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattbindung', 'Premium mit Werkstattbindung', true, 'voll', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'volkswagen-autoversicherung'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Volkswohl-Bund
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('volkswohl-bund', 'Volkswohl-Bund', 'optional', ARRAY['mit Werkstattservice']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 660)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'volkswohl-bund' AND v.name = 'VOLKSWOHL-BUND Sachversicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', NULL, 'Komfort', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'volkswohl-bund'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Komfort', 'mit Werkstattservice', 'Komfort mit Werkstattservice', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'volkswohl-bund'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KomfortPlus', NULL, 'KomfortPlus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'volkswohl-bund'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KomfortPlus', 'mit Werkstattservice', 'KomfortPlus mit Werkstattservice', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'volkswohl-bund'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- VRK
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('vrk', 'VRK', 'optional', ARRAY['Select']::text[], ARRAY['Kasko Plus']::text[],
  'HUK-Systematik (Versicherer im Raum der Kirchen).', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 670)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'vrk' AND v.name = 'Bruderhilfe Sachversicherung AG im Raum der Kirchen' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vrk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Select', 'Basis Select', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vrk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', NULL, 'Classic', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vrk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic', 'Select', 'Classic Select', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vrk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic Kasko Plus', NULL, 'Classic Kasko Plus', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vrk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Classic Kasko Plus', 'Select', 'Classic Select Kasko Plus', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'vrk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- WGV
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('wgv', 'WGV', 'optional', ARRAY['Kasko SELECT']::text[], '{}'::text[],
  NULL, NULL, 'P', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 680)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'wgv' AND v.name = 'WGV-Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'Kasko SELECT', 'Basis Kasko SELECT', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Optimal', NULL, 'Optimal', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Optimal', 'Kasko SELECT', 'Optimal Kasko SELECT', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Beamten Basis', NULL, 'Beamten Basis', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Beamten Basis', 'Kasko SELECT', 'Beamten Basis Kasko SELECT', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Beamten Optimal', NULL, 'Beamten Optimal', false, 'keine', 'belegt', 70
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Beamten Optimal', 'Kasko SELECT', 'Beamten Optimal Kasko SELECT', true, 'voll', 'belegt', 80
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wgv'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Württembergische
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('wuerttembergische', 'Württembergische', 'optional', ARRAY['mit Schadenservice+']::text[], '{}'::text[],
  'Bindungscharakter aus der Bezeichnung abgeleitet – AKB prüfen.', NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 690)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'wuerttembergische' AND v.name = 'Württembergische Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KompaktSchutz', NULL, 'KompaktSchutz', false, 'keine', 'abgeleitet', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wuerttembergische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KompaktSchutz', 'mit Schadenservice+', 'KompaktSchutz mit Schadenservice+', true, 'voll', 'abgeleitet', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wuerttembergische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'PremiumSchutz', NULL, 'PremiumSchutz', false, 'keine', 'abgeleitet', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wuerttembergische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'PremiumSchutz', 'mit Schadenservice+', 'PremiumSchutz mit Schadenservice+', true, 'voll', 'abgeleitet', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wuerttembergische'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- WWK
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('wwk', 'WWK', 'optional', ARRAY['mit Werkstattmanagement']::text[], ARRAY['XtraSchutz']::text[],
  NULL, 'Der Zusatz „mit XtraSchutz“ ändert nichts an der Werkstattwahl.', 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 700)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'wwk' AND v.name = 'WWK Allgemeine Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KFZ Basis', NULL, 'KFZ Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wwk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KFZ Basis', 'mit Werkstattmanagement', 'KFZ Basis mit Werkstattmanagement', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wwk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KFZ plus', NULL, 'KFZ plus', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wwk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'KFZ plus', 'mit Werkstattmanagement', 'KFZ plus mit Werkstattmanagement', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'wwk'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- Zurich
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('zurich', 'Zurich', 'optional', ARRAY['mit Werkstattbindung']::text[], '{}'::text[],
  NULL, NULL, 'L', 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 710)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'zurich' AND v.name = 'Zurich Insurance plc' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', NULL, 'Basis', false, 'keine', 'belegt', 10
FROM public.kasko_versicherer_marken m WHERE m.slug = 'zurich'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Basis', 'mit Werkstattbindung', 'Basis mit Werkstattbindung', true, 'voll', 'belegt', 20
FROM public.kasko_versicherer_marken m WHERE m.slug = 'zurich'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Top', NULL, 'Top', false, 'keine', 'belegt', 30
FROM public.kasko_versicherer_marken m WHERE m.slug = 'zurich'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Top', 'mit Werkstattbindung', 'Top mit Werkstattbindung', true, 'voll', 'belegt', 40
FROM public.kasko_versicherer_marken m WHERE m.slug = 'zurich'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', NULL, 'Premium', false, 'keine', 'belegt', 50
FROM public.kasko_versicherer_marken m WHERE m.slug = 'zurich'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;
INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, 'Premium', 'mit Werkstattbindung', 'Premium mit Werkstattbindung', true, 'voll', 'belegt', 60
FROM public.kasko_versicherer_marken m WHERE m.slug = 'zurich'
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;

-- HDI
INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES ('hdi', 'HDI', 'optional', ARRAY['Werkstattbindung','Partnerwerkstatt']::text[], ARRAY['Freie Werkstattwahl (nur für private Pkw)']::text[],
  'Nicht in der CHECK24-Liste. Werkstattbindungs-Baustein laut HDI-Broschüre vorhanden (Bezeichnung und Nachlass nicht belegt); Alternative „Freie Werkstattwahl (nur für private Pkw)“ = keine Bindung. Ohne Tarifliste – Rückfrage am Versicherungsschein.', NULL, NULL, 'CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026', '2026-07-20'::date, 720)
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();
UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = 'hdi' AND v.name = 'HDI Versicherung AG' AND m.versicherung_id IS NULL;
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('hdi', (SELECT id FROM public.kasko_versicherer_marken WHERE slug = 'hdi'), '„Sie sparen dabei“ (Höhe nicht belegt)', 'unbekannt', 'Kürzung bei Reparatur außerhalb des Netzes laut AKB (Höhe öffentlich nicht belegt).',
  'Kaskofall', 'Alternative „Freie Werkstattwahl (nur für private Pkw)“ = keine Bindung', 'zertifizierte HDI-Partnerwerkstätten, Herstellergarantie bleibt erhalten', NULL, 'HDI-Broschüre Mobilität/Auto (hdi.de/kfz)')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;

-- Default-Konditionen (GDV-Muster) fuer alle Marken ohne belegte Werte
INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES ('__default__', NULL, 'marktüblich 10–20 % auf den Kaskobeitrag', 'kuerzung_80', 'Bis zur Reparatur in der vom Versicherer benannten Werkstatt wird die Erstattung auf 80 % der marktüblich kalkulierten Reparaturkosten begrenzt, mindestens mit einer zusätzlichen Selbstbeteiligung von 100 € (GDV-Muster-AKB A.2.5.2.5.2).',
  'Vollkasko und Teilkasko inkl. Glas', 'Haftpflichtschaden Dritter · Totalschaden · Reparatur im Ausland · keine erreichbare Partnerwerkstatt', 'jeweiliges Partnernetz (häufig Innovation Group, HUK-Netz, DEKRA)', 'GDV-Muster-AKB A.2.5.2.5.1 / A.2.5.2.5.2', 'GDV-Muster-AKB; CHECK24')
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;
