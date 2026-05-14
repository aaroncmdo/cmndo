UPDATE faelle
SET hat_vorschaeden = vorschaden_vorhanden
WHERE hat_vorschaeden IS NULL
  AND vorschaden_vorhanden IS NOT NULL;;
