-- AAR-580 (N3) — leads: leasing_flag + finanzierung_flag droppen,
-- finanzierung_leasing (Enum: keine | leasing | finanzierung) bleibt als
-- einzige Source of Truth. Parität zum bereits durchgezogenen AAR-548 D10
-- auf `faelle`.

UPDATE leads
SET finanzierung_leasing = CASE
  WHEN leasing_flag = true THEN 'leasing'
  WHEN finanzierung_flag = true THEN 'finanzierung'
  ELSE finanzierung_leasing
END
WHERE finanzierung_leasing IS NULL OR finanzierung_leasing = 'keine';

ALTER TABLE leads DROP COLUMN IF EXISTS leasing_flag;
ALTER TABLE leads DROP COLUMN IF EXISTS finanzierung_flag;
