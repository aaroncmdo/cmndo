-- CMM-44 SP-A2 PR2 — Dependency-Audit vor DROP COLUMN x28 auf faelle.
-- Findet Views/Rules/Trigger/Funktionen, die die zu droppenden Spalten referenzieren.
-- Jedes Treffer-Objekt muss vor dem DROP angepasst werden (CREATE OR REPLACE).

-- (1) Views/Rules, die faelle referenzieren
SELECT DISTINCT dep.relname AS abhaengiges_objekt, dep.relkind
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dep ON dep.oid = r.ev_class
JOIN pg_class src ON src.oid = d.refobjid
WHERE src.relname = 'faelle'
ORDER BY dep.relname;

-- (2) Trigger auf faelle
SELECT tgname, pg_get_triggerdef(oid) AS triggerdef
FROM pg_trigger
WHERE tgrelid = 'public.faelle'::regclass AND NOT tgisinternal
ORDER BY tgname;

-- (3) Funktionen, deren Body einen der 28 faelle-Namen referenziert
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ~ ('\m(' ||
  'schadens_adresse|unfallort|schadens_plz|schadens_ort|unfallort_kategorie|' ||
  'unfallort_lat|unfallort_lng|schadens_datum|unfalldatum|schadens_entdeckt_am|' ||
  'unfall_uhrzeit|schadens_beschreibung|unfallhergang|schadens_hergang|schadens_art|' ||
  'schadens_fall_typ|personenschaden_flag|halter_ungleich_fahrer_flag|sachschaden_flag|' ||
  'mietwagen_flag|mietwagen_hat|nutzungsausfall|gegner_schadennummer|no_show_count|' ||
  'aktuelle_phase|konvertiert_von_lead|regulierung_betrag|vs_ablehnungsgrund) ')
ORDER BY p.proname;
