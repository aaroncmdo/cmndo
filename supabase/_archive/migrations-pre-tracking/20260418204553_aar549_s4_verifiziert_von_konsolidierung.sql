ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS verifiziert_von_user_id;

COMMENT ON COLUMN sachverstaendige.verifiziert_von IS
  'Admin-User der Tier-2-Verifizierung freigegeben hat (FK -> profiles). Kanonische Quelle seit AAR-549 S4 (ersetzt verifiziert_von_user_id).';;
