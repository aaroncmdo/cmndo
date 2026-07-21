-- FlowLink operative Vollstaendigkeit — Task 10: Matrix befuellen (Spec 2026-07-21).
-- Spiegelt flow-config-fixture.ts in flow_szenario_steps/flow_szenarien. Prod-Code (94f63dff)
-- traegt die Render-Bloecke werkstatt_anzeige/werkstattbindung_check (deploy-vps success 18:27).
-- Wipe-and-reinsert der 3 reworkten Szenarien; nur_gutachter loeschen (FK ON DELETE CASCADE raeumt Steps).
-- Bereits via apply_migration auf prod appliziert (getrackte Version 20260721183542) — dieses File
-- haelt die Migrations-Historie reproduzierbar (File == Version, kein Twin-Drift).
DELETE FROM public.flow_szenario_steps WHERE szenario_id IN ('haftpflicht','kasko','selbstzahler');
INSERT INTO public.flow_szenario_steps (szenario_id, step_id, reihenfolge, bedingung, erhebt_felder) VALUES
  ('haftpflicht','zusammenfassung',1,NULL,'{}'),
  ('haftpflicht','feststellung',2,NULL,'{kennzeichen,unfallhergang,unfallort,gegner_versicherung}'),
  ('haftpflicht','ort_besichtigung',3,NULL,'{besichtigungsort_adresse}'),
  ('haftpflicht','termin',4,'{"sv_id": null}','{}'),
  ('haftpflicht','gutachter',5,NULL,'{}'),
  ('haftpflicht','ort_fahrzeug',6,NULL,'{fahrzeug_standort_adresse}'),
  ('haftpflicht','werkstatt',7,'{"reparatur_werkstatt_id": null}','{}'),
  ('haftpflicht','werkstatt_anzeige',8,'{"reparatur_werkstatt_id": "$gesetzt"}','{}'),
  ('haftpflicht','sa',9,NULL,'{}'),
  ('haftpflicht','account',10,NULL,'{}'),
  ('kasko','zusammenfassung',1,NULL,'{}'),
  ('kasko','feststellung',2,NULL,'{kennzeichen,schadentyp}'),
  ('kasko','werkstattbindung_check',3,'{"freie_werkstattwahl": null}','{}'),
  ('kasko','ort_fahrzeug',4,NULL,'{fahrzeug_standort_adresse}'),
  ('kasko','werkstatt',5,'{"reparatur_werkstatt_id": null}','{}'),
  ('kasko','werkstatt_anzeige',6,'{"reparatur_werkstatt_id": "$gesetzt"}','{}'),
  ('kasko','account',7,NULL,'{}'),
  ('selbstzahler','zusammenfassung',1,NULL,'{}'),
  ('selbstzahler','feststellung',2,NULL,'{kennzeichen,schadentyp}'),
  ('selbstzahler','ort_fahrzeug',3,NULL,'{fahrzeug_standort_adresse}'),
  ('selbstzahler','werkstatt',4,'{"reparatur_werkstatt_id": null}','{}'),
  ('selbstzahler','werkstatt_anzeige',5,'{"reparatur_werkstatt_id": "$gesetzt"}','{}'),
  ('selbstzahler','account',6,NULL,'{}');
DELETE FROM public.flow_szenarien WHERE id = 'nur_gutachter';
