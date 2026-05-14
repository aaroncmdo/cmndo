ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS gesperrt_am;

COMMENT ON COLUMN sachverstaendige.gesperrt_seit IS
  'Zeitpunkt der Account-Sperre (manuell durch Admin). Kanonische Quelle seit AAR-549 S8 (ersetzt gesperrt_am).';;
