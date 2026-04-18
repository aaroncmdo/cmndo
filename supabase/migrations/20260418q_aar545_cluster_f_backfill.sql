-- AAR-545 Cluster F (Phase 2) — Vorschaden-Flag
-- vorschaden_vorhanden ist redundant zu hat_vorschaeden (Kunden-Angabe).
-- vorschaden_erkannt (CarDentity) und vorschaden_geprueft (KB) bleiben unberührt.

UPDATE faelle
SET hat_vorschaeden = vorschaden_vorhanden
WHERE hat_vorschaeden IS NULL
  AND vorschaden_vorhanden IS NOT NULL;
