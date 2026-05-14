-- AAR-270: Wochentag-Präferenz für SV-Termin-Filter
ALTER TABLE leads ADD COLUMN IF NOT EXISTS wunschtermin_wochentage integer[] DEFAULT NULL;

COMMENT ON COLUMN leads.wunschtermin_wochentage IS 'AAR-270: ISO-Wochentage 1=Mo..7=So, mehrfach erlaubt. NULL=Egal/kein Filter.';;
