SELECT 'plz_42853' AS section, json_agg(row_to_json(t)) AS data
FROM (SELECT plz, lat, lng, ort FROM plz_geo WHERE plz = '42853') t
UNION ALL
SELECT 'sv_cakmak' AS section, json_agg(row_to_json(t)) AS data
FROM (
  SELECT id, firmenname, standort_plz, standort_lat, standort_lng
  FROM sachverstaendige
  WHERE firmenname ILIKE '%cakmak%'
) t
UNION ALL
SELECT 'termine_heute' AS section, json_agg(row_to_json(t)) AS data
FROM (
  SELECT id, start_zeit, status, fall_id, lead_id, sv_id
  FROM gutachter_termine
  WHERE start_zeit::date = CURRENT_DATE
  ORDER BY start_zeit
) t
UNION ALL
SELECT 'termine_fall_existenz' AS section, json_agg(row_to_json(t)) AS data
FROM (
  SELECT t.id AS termin_id, t.fall_id, f.fall_nummer
  FROM gutachter_termine t
  LEFT JOIN faelle f ON f.id = t.fall_id
  WHERE t.start_zeit::date = CURRENT_DATE
) t;
