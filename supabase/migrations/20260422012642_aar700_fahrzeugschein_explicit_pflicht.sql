-- AAR-700: Fahrzeugschein nur dann als Pflicht-Anfrage zeigen, wenn der
-- Dispatcher die ZB1-Erfassung aktiv getriggert hat.
--
-- Vorher: pflicht_wenn = `lead.zb1_status NOT IN ('bestaetigt','hochgeladen')`
-- → bei jedem frischen Lead (zb1_status NULL) automatisch pflicht=true.
-- Folge: Banner zeigte Fahrzeugschein, obwohl niemand danach gefragt hat.
--
-- Neue Semantik analog Polizeibericht (`polizei_vor_ort=true`):
-- Fahrzeugschein wird erst pflicht (und freigeschaltet) wenn der Dispatcher
-- die ZB1-Anfrage über DokumenteAnfordernCard versendet hat — dann steht
-- `lead.zb1_status='gesendet'` (siehe triggerDokumenteUploadRequest).
--
-- Backfill: Bestehende Pflichtdokumente-Rows mit dokument_typ='fahrzeugschein'
-- und status='ausstehend' deren zugehöriger Lead kein zb1_status='gesendet'
-- hat → pflicht=false setzen, damit der Banner sie sofort verschwinden lässt.

UPDATE dokument_katalog
SET
  pflicht_wenn = '{"op":"eq","field":"lead.zb1_status","value":"gesendet"}'::jsonb,
  freigeschaltet_wenn = '{"op":"eq","field":"lead.zb1_status","value":"gesendet"}'::jsonb
WHERE slot_id = 'fahrzeugschein';

UPDATE pflichtdokumente p
SET pflicht = false
FROM faelle f
LEFT JOIN leads l ON l.id = f.lead_id
WHERE p.fall_id = f.id
  AND p.dokument_typ = 'fahrzeugschein'
  AND p.status = 'ausstehend'
  AND p.pflicht = true
  AND COALESCE(l.zb1_status, '') <> 'gesendet';
