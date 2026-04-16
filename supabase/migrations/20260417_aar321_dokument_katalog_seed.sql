-- AAR-321 Seed: 24 Dokument-Slots mit JSON-Rule-DSL.
-- Rule-Format: { "op": "eq"|"in"|"not_in"|"and"|"or", "field": "lead.col"|"fall.col", "value": ..., "conditions": [...] }
-- NULL = immer freigeschaltet / nie automatisch Pflicht.
-- Idempotent via ON CONFLICT (slot_id) DO UPDATE.
--
-- Applied via Supabase MCP apply_migration am 2026-04-17. Kanonische Kopie für git-History.

INSERT INTO public.dokument_katalog (
  slot_id, label, beschreibung, kategorie,
  freigeschaltet_wenn, pflicht_wenn,
  sichtbar_fuer, anforderbar_von, uploadbar_von,
  multi_file, akzeptierte_mime_types, max_mb, sort_order
) VALUES
  -- STAMMDATEN (1-10)
  ('fahrzeugschein', 'Fahrzeugschein (ZB1)', 'Beide Seiten, lesbar', 'stammdaten',
   NULL,
   '{"op":"not_in","field":"lead.zb1_status","value":["bestaetigt","hochgeladen"]}'::jsonb,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   false, ARRAY['image/jpeg','image/png','image/heic','application/pdf']::text[], 10, 1),

  ('fuehrerschein', 'Führerschein', 'Beide Seiten, Fahrer zum Unfallzeitpunkt', 'stammdaten',
   '{"op":"and","conditions":[{"op":"eq","field":"lead.service_typ","value":"komplett"},{"op":"eq","field":"lead.wa_gesendet","value":false}]}'::jsonb,
   '{"op":"and","conditions":[{"op":"eq","field":"lead.service_typ","value":"komplett"},{"op":"eq","field":"lead.wa_gesendet","value":false}]}'::jsonb,
   ARRAY['kunde','kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   false, ARRAY['image/jpeg','image/png','image/heic','application/pdf']::text[], 10, 2),

  -- UNFALL (11-20)
  ('polizeibericht', 'Polizeibericht', 'Wenn Polizei vor Ort war', 'unfall',
   '{"op":"or","conditions":[{"op":"eq","field":"lead.polizei_vor_ort","value":true},{"op":"eq","field":"lead.polizeibericht_pflicht","value":true}]}'::jsonb,
   '{"op":"eq","field":"lead.polizeibericht_pflicht","value":true}'::jsonb,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','sachverstaendiger','admin']::text[],
   ARRAY['kunde','kundenbetreuer','sachverstaendiger']::text[],
   false, ARRAY['image/jpeg','image/png','application/pdf']::text[], 15, 11),

  ('schadensfotos', 'Schadensfotos', 'Alle Schadenstellen aus mehreren Perspektiven', 'unfall',
   NULL, NULL,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','sachverstaendiger','admin']::text[],
   ARRAY['kunde','kundenbetreuer','sachverstaendiger']::text[],
   true, ARRAY['image/jpeg','image/png','image/heic']::text[], 20, 12),

  ('zeugenbericht', 'Zeugenbericht', 'Unterschriebener Bericht durch Zeugen', 'unfall',
   '{"op":"or","conditions":[{"op":"eq","field":"lead.zeugen_vorhanden","value":true},{"op":"eq","field":"fall.zeugen_vorhanden","value":true}]}'::jsonb,
   '{"op":"or","conditions":[{"op":"eq","field":"lead.zeugen_vorhanden","value":true},{"op":"eq","field":"fall.zeugen_vorhanden","value":true}]}'::jsonb,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   true, ARRAY['image/jpeg','image/png','application/pdf']::text[], 10, 13),

  -- PERSONENSCHADEN (21-30)
  ('aerztliches_attest', 'Ärztliches Attest', 'Bei Personenschaden', 'personenschaden',
   '{"op":"eq","field":"lead.personenschaden_flag","value":true}'::jsonb,
   '{"op":"eq","field":"lead.personenschaden_flag","value":true}'::jsonb,
   ARRAY['kunde','kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   true, ARRAY['image/jpeg','image/png','application/pdf']::text[], 10, 21),

  ('diagnosebericht', 'Diagnosebericht', 'Ärztliche Diagnose', 'personenschaden',
   '{"op":"eq","field":"lead.personenschaden_flag","value":true}'::jsonb, NULL,
   ARRAY['kunde','kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   true, ARRAY['image/jpeg','image/png','application/pdf']::text[], 10, 22),

  ('krankenhausbericht', 'Krankenhausbericht', 'Bei stationärer Behandlung', 'personenschaden',
   '{"op":"eq","field":"lead.personenschaden_flag","value":true}'::jsonb, NULL,
   ARRAY['kunde','kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   true, ARRAY['image/jpeg','image/png','application/pdf']::text[], 15, 23),

  ('au_bescheinigung', 'AU-Bescheinigung', 'Arbeitsunfähigkeit', 'personenschaden',
   '{"op":"eq","field":"lead.personenschaden_flag","value":true}'::jsonb, NULL,
   ARRAY['kunde','kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   true, ARRAY['image/jpeg','image/png','application/pdf']::text[], 10, 24),

  -- FAHRZEUG (31-40)
  ('reparaturrechnungen_vorschaeden', 'Reparaturrechnungen Vorschäden', 'Nachweis dass Vorschäden repariert wurden', 'fahrzeug',
   '{"op":"or","conditions":[{"op":"eq","field":"lead.hat_vorschaeden","value":true},{"op":"eq","field":"lead.vorschaden_vorhanden","value":true}]}'::jsonb,
   '{"op":"or","conditions":[{"op":"eq","field":"lead.hat_vorschaeden","value":true},{"op":"eq","field":"lead.vorschaden_vorhanden","value":true}]}'::jsonb,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer','sachverstaendiger']::text[],
   true, ARRAY['application/pdf','image/jpeg','image/png']::text[], 10, 31),

  ('vorschaden_bericht', 'Vorschaden-Bericht', 'SV-Bericht zur Vorschadenabgrenzung', 'fahrzeug',
   NULL, NULL,
   ARRAY['kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','sachverstaendiger','admin']::text[],
   ARRAY['sachverstaendiger']::text[],
   false, ARRAY['application/pdf']::text[], 20, 32),

  -- KOSTEN (41-50)
  ('mietwagenrechnung', 'Mietwagenrechnung', 'Bei Mietwagen-Anspruch', 'kosten',
   '{"op":"or","conditions":[{"op":"eq","field":"lead.mietwagen_flag","value":true},{"op":"eq","field":"lead.nutzungsausfall","value":true}]}'::jsonb,
   NULL,
   ARRAY['kunde','kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   true, ARRAY['application/pdf','image/jpeg','image/png']::text[], 10, 41),

  ('rechnung_gutachten', 'Rechnung Gutachten', 'SV-Honorarrechnung', 'kosten',
   NULL, NULL,
   ARRAY['admin','kundenbetreuer','sachverstaendiger']::text[],
   ARRAY['admin','kundenbetreuer']::text[],
   ARRAY['admin','kundenbetreuer']::text[],
   false, ARRAY['application/pdf']::text[], 10, 42),

  ('rechnung_kanzlei', 'Rechnung Kanzlei', 'Kanzlei-Abrechnung', 'kosten',
   NULL, NULL,
   ARRAY['admin','kundenbetreuer','kanzlei']::text[],
   ARRAY['admin','kundenbetreuer']::text[],
   ARRAY['admin','kundenbetreuer']::text[],
   false, ARRAY['application/pdf']::text[], 10, 43),

  -- GUTACHTEN (51-60)
  ('gutachten', 'Gutachten (PDF)', 'Fertiges SV-Gutachten', 'gutachten',
   NULL, NULL,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','admin']::text[],
   ARRAY['sachverstaendiger']::text[],
   false, ARRAY['application/pdf']::text[], 50, 51),

  ('gutachter_fotos', 'Gutachter-Fotos', 'Vom SV bei Besichtigung aufgenommen', 'gutachten',
   NULL, NULL,
   ARRAY['admin','kundenbetreuer','sachverstaendiger']::text[],
   ARRAY['kundenbetreuer','sachverstaendiger','admin']::text[],
   ARRAY['sachverstaendiger']::text[],
   true, ARRAY['image/jpeg','image/png','image/heic']::text[], 20, 52),

  ('technische_stellungnahme', 'Technische Stellungnahme', 'Bei Rückfragen der Versicherung', 'gutachten',
   '{"op":"in","field":"fall.technische_stellungnahme_status","value":["beauftragt","in-bearbeitung","abgeschlossen"]}'::jsonb,
   '{"op":"eq","field":"fall.technische_stellungnahme_status","value":"beauftragt"}'::jsonb,
   ARRAY['admin','kundenbetreuer','sachverstaendiger','kanzlei']::text[],
   ARRAY['admin','kundenbetreuer','kanzlei']::text[],
   ARRAY['sachverstaendiger']::text[],
   false, ARRAY['application/pdf']::text[], 20, 53),

  ('nachbesichtigung_bericht', 'Nachbesichtigungs-Bericht', 'Nach zusätzlicher Besichtigung', 'gutachten',
   '{"op":"eq","field":"fall.nachbesichtigung_status","value":"durchgefuehrt"}'::jsonb, NULL,
   ARRAY['admin','kundenbetreuer','sachverstaendiger','kanzlei']::text[],
   ARRAY['admin','kundenbetreuer','kanzlei']::text[],
   ARRAY['sachverstaendiger']::text[],
   false, ARRAY['application/pdf']::text[], 20, 54),

  ('ki_kalkulation', 'KI-Schadenkalkulation', 'Audatex/DAT-Kalkulation', 'gutachten',
   NULL, NULL,
   ARRAY['admin','kundenbetreuer','kanzlei']::text[],
   ARRAY['admin','kundenbetreuer']::text[],
   ARRAY['admin','kundenbetreuer']::text[],
   false, ARRAY['application/pdf']::text[], 20, 55),

  -- KANZLEI (61-70)
  ('sa_vollmacht', 'Sicherungsabtretung (SA/Vollmacht)', 'Vom Kunden unterschrieben', 'kanzlei',
   NULL, NULL,
   ARRAY['admin','leadbearbeiter','kundenbetreuer','kunde','kanzlei']::text[],
   ARRAY['admin']::text[],
   ARRAY['admin']::text[],
   false, ARRAY['application/pdf']::text[], 5, 61),

  ('anspruchsschreiben', 'Anspruchsschreiben', 'Von Kanzlei an Versicherung', 'kanzlei',
   NULL, NULL,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','admin']::text[],
   ARRAY['kanzlei','admin']::text[],
   false, ARRAY['application/pdf']::text[], 20, 62),

  ('regulierungsbescheid', 'Regulierungsbescheid', 'Von Versicherung', 'kanzlei',
   NULL, NULL,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   false, ARRAY['application/pdf']::text[], 20, 63),

  ('kanzlei_paket', 'Kanzlei-Paket', 'Mandats- & Unterlagen-Paket', 'kanzlei',
   NULL, NULL,
   ARRAY['admin','kundenbetreuer','kanzlei']::text[],
   ARRAY['kundenbetreuer','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei']::text[],
   false, ARRAY['application/pdf']::text[], 50, 64),

  -- SONSTIGES (99)
  ('kunde-nachreichung', 'Kunden-Nachreichung (unzugeordnet)', 'Vom Kunden hochgeladen, noch nicht zugeordnet', 'sonstiges',
   NULL, NULL,
   ARRAY['admin','kundenbetreuer']::text[],
   ARRAY['admin']::text[],
   ARRAY['kunde']::text[],
   true, ARRAY['image/jpeg','image/png','image/heic','application/pdf']::text[], 20, 99)

ON CONFLICT (slot_id) DO UPDATE SET
  label = EXCLUDED.label,
  beschreibung = EXCLUDED.beschreibung,
  kategorie = EXCLUDED.kategorie,
  freigeschaltet_wenn = EXCLUDED.freigeschaltet_wenn,
  pflicht_wenn = EXCLUDED.pflicht_wenn,
  sichtbar_fuer = EXCLUDED.sichtbar_fuer,
  anforderbar_von = EXCLUDED.anforderbar_von,
  uploadbar_von = EXCLUDED.uploadbar_von,
  multi_file = EXCLUDED.multi_file,
  akzeptierte_mime_types = EXCLUDED.akzeptierte_mime_types,
  max_mb = EXCLUDED.max_mb,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
