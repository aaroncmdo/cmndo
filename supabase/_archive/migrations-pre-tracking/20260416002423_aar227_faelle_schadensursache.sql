
-- AAR-227: faelle.schadensursache fehlte → signSAandCreateFall crashte beim Fall-Insert
-- leads.schadensursache existiert, faelle.schadensursache war nie angelegt worden.
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS schadensursache TEXT;

COMMENT ON COLUMN faelle.schadensursache IS 'Freitextfeld Schadensursache aus Lead übernommen (AAR-227)';
;
