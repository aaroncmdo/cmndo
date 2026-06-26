-- Pflichtdok-Kanonisierung P1: 4 Kunde-Pflicht-Slots in den Katalog (waren nur im
-- Code-Supplementaer von create-pflicht.ts) + polizeibericht-Regel um Fahrerflucht
-- erweitern. Macht dokument_katalog zur vollstaendigen SSoT (Spec 2026-06-26).
insert into public.dokument_katalog
  (slot_id, label, beschreibung, kategorie, freigeschaltet_wenn, pflicht_wenn,
   sichtbar_fuer, anforderbar_von, uploadbar_von, multi_file, akzeptierte_mime_types,
   max_mb, sort_order, aktiv, steuert_kundensichtbarkeit)
values
 ('halter_vollmacht','Halter-Vollmacht','Vollmacht des Fahrzeughalters, wenn Halter und Anrufer abweichen.','stammdaten',
   '{"op":"eq","field":"lead.halter_ungleich_fahrer_flag","value":true}'::jsonb,
   '{"op":"eq","field":"lead.halter_ungleich_fahrer_flag","value":true}'::jsonb,
   array['kunde','kundenbetreuer','admin'], array['kundenbetreuer','admin'], array['kunde'],
   false, array['application/pdf','image/jpeg','image/png'], 10, 6, true, false),
 ('halter_ausweis','Halter-Ausweis','Ausweis des Fahrzeughalters, wenn Halter und Anrufer abweichen.','stammdaten',
   '{"op":"eq","field":"lead.halter_ungleich_fahrer_flag","value":true}'::jsonb,
   '{"op":"eq","field":"lead.halter_ungleich_fahrer_flag","value":true}'::jsonb,
   array['kunde','kundenbetreuer','admin'], array['kundenbetreuer','admin'], array['kunde'],
   false, array['application/pdf','image/jpeg','image/png'], 10, 7, true, false),
 ('gewerbenachweis','Gewerbenachweis','Gewerbeanmeldung zur Vorsteuer-Prüfung.','stammdaten',
   '{"op":"or","conditions":[{"op":"eq","field":"lead.gewerbe_flag","value":true},{"op":"eq","field":"lead.vorsteuerabzugsberechtigt","value":true}]}'::jsonb,
   '{"op":"or","conditions":[{"op":"eq","field":"lead.gewerbe_flag","value":true},{"op":"eq","field":"lead.vorsteuerabzugsberechtigt","value":true}]}'::jsonb,
   array['kunde','kundenbetreuer','admin'], array['kundenbetreuer','admin'], array['kunde'],
   false, array['application/pdf','image/jpeg','image/png'], 10, 8, true, false),
 ('gf_vollmacht','Geschäftsführer-Vollmacht','Vollmacht des Geschäftsführers bei gewerblicher Anmeldung.','stammdaten',
   '{"op":"or","conditions":[{"op":"eq","field":"lead.gewerbe_flag","value":true},{"op":"eq","field":"lead.vorsteuerabzugsberechtigt","value":true}]}'::jsonb,
   '{"op":"or","conditions":[{"op":"eq","field":"lead.gewerbe_flag","value":true},{"op":"eq","field":"lead.vorsteuerabzugsberechtigt","value":true}]}'::jsonb,
   array['kunde','kundenbetreuer','admin'], array['kundenbetreuer','admin'], array['kunde'],
   false, array['application/pdf','image/jpeg','image/png'], 10, 9, true, false)
on conflict (slot_id) do nothing;

update public.dokument_katalog set
  freigeschaltet_wenn = '{"op":"or","conditions":[{"op":"eq","field":"lead.polizei_vor_ort","value":true},{"op":"eq","field":"lead.fahrerflucht","value":true}]}'::jsonb,
  pflicht_wenn        = '{"op":"or","conditions":[{"op":"eq","field":"lead.polizei_vor_ort","value":true},{"op":"eq","field":"lead.fahrerflucht","value":true}]}'::jsonb
where slot_id = 'polizeibericht';
