-- CMM-49 Onboarding-Writer-Kanonisierung (WP-C): die 2 kunde-onboarding-Felder mit
-- db_target.tabelle='leads' sind Upload-Felder (fahrzeugschein_foto=zb1-upload, schadensfotos=file)
-- — KEINE generischen Feld-Writes. Der Upload laeuft ueber Storage/OCR (fahrzeugschein->kennzeichen
-- via OCR-Endpoint), nicht ueber den Save. In kunde-onboarding (post-conversion) gibt es zudem keinen
-- leadId-Kontext -> der neue saveOnboardingFields-Router wuerde auf leads hart fehlern.
-- db_target.tabelle -> '_self' (Sentinel, vom Router uebersprungen wie _finalize/_termin; die spalte
-- BLEIBT fuer die load-needed-phases-Skip-Logik). Altes Verhalten unveraendert (saveOnboardingStep
-- ALLOWED_TABLES={gfa} skippte leads ohnehin; _self wird genauso geskippt + bleibt gerendert).
UPDATE onboarding_felder f
SET db_target = jsonb_set(f.db_target, '{tabelle}', '"_self"')
FROM onboarding_phasen p
WHERE f.phase_id = p.id
  AND p.flow_key = 'kunde-onboarding'
  AND f.feld_key IN ('fahrzeugschein_foto', 'schadensfotos')
  AND f.db_target->>'tabelle' = 'leads';
