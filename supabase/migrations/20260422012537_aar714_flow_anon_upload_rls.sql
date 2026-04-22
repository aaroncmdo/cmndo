-- AAR-714: Storage-Policy für anon Flow-Uploads (fall-dokumente, Prefix `flow/`).
--
-- Im /flow/[token]-Wizard ist der Kunde noch NICHT authentifiziert (Pre-SA),
-- lädt aber bereits Schadensfotos & Unterschrift hoch. Die existierenden
-- Policies setzen `auth.role()='authenticated'` voraus → anon-Upload schlägt
-- mit "new row violates row-level security policy" fehl.
--
-- Lösung: Eine zusätzliche INSERT-Policy für anon+authenticated, die nur
-- Pfade mit dem `flow/`-Prefix erlaubt. Dadurch bleibt der Rest des Buckets
-- für Anonyme dicht, aber der Flow-Wizard funktioniert wie geplant.
--
-- Code-Referenz (AAR-305/Audit-M1): src/app/flow/[token]/FlowWizardKfz.tsx
-- nutzt path = `flow/schadensfotos-lead/<id>/...` und `flow/signatures/...`.

CREATE POLICY "Flow anon can upload to fall-dokumente"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'fall-dokumente'
  AND name LIKE 'flow/%'
);

CREATE POLICY "Flow anon can read fall-dokumente flow path"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'fall-dokumente'
  AND name LIKE 'flow/%'
);
