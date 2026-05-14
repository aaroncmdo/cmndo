UPDATE faelle
SET vs_reaktion_am = vs_antwort_datum
WHERE vs_reaktion_am IS NULL
  AND vs_antwort_datum IS NOT NULL;

UPDATE faelle
SET vs_eskalationsstufe = vs_timer_stufe
WHERE vs_eskalationsstufe IS NULL
  AND vs_timer_stufe IS NOT NULL;;
