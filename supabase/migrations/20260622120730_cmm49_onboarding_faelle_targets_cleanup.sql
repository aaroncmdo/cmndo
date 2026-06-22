-- CMM-49 WP-D: kunde-onboarding hatte 3 onboarding_felder mit db_target.tabelle='faelle'.
-- Der Writer (saveOnboardingStep) skippt 'faelle' still (ALLOWED_TABLES kennt es nicht) -> sie
-- schrieben nie. Vor dem faelle-DROP die Config kanonisch machen, damit sie nicht auf eine
-- gedroppte Tabelle zeigt (und der service_typ-Feld-Verlust behoben wird).

-- (1) Zwei doppelt-tote Targets entfernen: dsgvo_onboarding -> faelle.dsgvo_zustimmung_am und
--     sa_signatur_data_url -> faelle.sa_signatur_data_url. faelle hat diese Spalten GAR NICHT
--     (sie leben auf gutachter_finder_anfragen = pre-conversion-Capture im /flow). Vestigial.
DELETE FROM onboarding_felder f
USING onboarding_phasen p
WHERE f.phase_id = p.id
  AND p.flow_key = 'kunde-onboarding'
  AND f.feld_key IN ('dsgvo_onboarding', 'sa_signatur_data_url')
  AND f.db_target->>'tabelle' = 'faelle';

-- (2) service_typ ist ein echtes Pflichtfeld (Service-Umfang, toggle-cards komplett/nur_gutachter).
--     Es zeigte auf faelle.service_typ -> still verschluckt (Feld-Verlust). claims ist SSoT ->
--     db_target.tabelle auf 'claims' umbiegen (spalte bleibt service_typ). saveStep.ts nimmt
--     'service_typ' in die CLAIMS_ONBOARDING_WRITABLE-Allowlist auf (sonst skippt der claims-Handler).
UPDATE onboarding_felder f
SET db_target = jsonb_set(f.db_target, '{tabelle}', '"claims"')
FROM onboarding_phasen p
WHERE f.phase_id = p.id
  AND p.flow_key = 'kunde-onboarding'
  AND f.feld_key = 'service_typ'
  AND f.db_target->>'tabelle' = 'faelle';
