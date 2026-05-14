
-- AAR-266 Fix A: generateSAPdf speichert SA als text/html. Bis echtes PDF
-- implementiert ist (Fix B), den MIME-Type im Bucket zulassen damit der
-- SA-Upload nicht still fehlschlägt und abtretung_pdf eine Phantom-URL setzt.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'text/html')
WHERE id = 'dokumente'
AND NOT ('text/html' = ANY(allowed_mime_types));
;
