-- AAR-553 G3: Legacy `dokumente`-Tabelle droppen.
--
-- Voraussetzungen (vorab verifiziert):
--   - public.dokumente: 0 Rows (keine Live-Daten)
--   - public.fall_dokumente: 6 aktive Rows, alle storage_path im
--     `fall-dokumente`-Bucket auflösbar
--   - Code (G2a/G2b): Keine .from('dokumente') und keine
--     storage.from('dokumente') mehr im Quellcode
--
-- Der `dokumente`-Storage-Bucket (29 redundante Objekte — alle auch in
-- `fall-dokumente` vorhanden) wird separat per Storage-API / Dashboard
-- entfernt, da Postgres-seitige Löschung von storage.objects durch den
-- Trigger `storage.protect_delete` blockiert wird.

DROP TABLE IF EXISTS public.dokumente CASCADE;;
