UPDATE faelle
SET reparaturkosten = schadenshoehe
WHERE reparaturkosten IS NULL
  AND schadenshoehe IS NOT NULL;;
