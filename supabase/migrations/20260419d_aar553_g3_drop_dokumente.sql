-- AAR-553 G3: Legacy `dokumente`-Tabelle droppen.
--
-- Voraussetzungen (vorab verifiziert):
--   - public.dokumente: 0 Rows (keine Live-Daten)
--   - public.fall_dokumente: aktive Rows mit storage_path im
--     `fall-dokumente`-Bucket auflösbar
--   - Code (G2a/G2b): Keine .from('dokumente') und keine
--     storage.from('dokumente') mehr im Quellcode
--
-- Der `dokumente`-Storage-Bucket (29 redundante Objekte — alle auch in
-- `fall-dokumente` vorhanden) wurde separat per Storage-API entfernt
-- (Postgres-seitige Löschung von storage.objects durch Trigger
-- `storage.protect_delete` blockiert).

DROP TABLE IF EXISTS public.dokumente CASCADE;
