-- AAR-549 S2: Fall-Kontingent-Felder konsolidieren
-- paket_faelle_gesamt ist kanonische Quelle.
-- max_faelle_monat (legacy) + kontingent_soll (nie genutzt) werden gedroppt.
--
-- Prod-Daten: alle 4 Zeilen haben max_faelle_monat = paket_faelle_gesamt.
-- kontingent_soll ist NULL in allen 4 Zeilen → kein Backfill nötig.

ALTER TABLE sachverstaendige DROP COLUMN max_faelle_monat;
ALTER TABLE sachverstaendige DROP COLUMN kontingent_soll;

COMMENT ON COLUMN sachverstaendige.paket_faelle_gesamt IS 'Monatliches Fall-Kontingent — kanonische Quelle (ersetzt max_faelle_monat, kontingent_soll seit AAR-549 S2).';;
