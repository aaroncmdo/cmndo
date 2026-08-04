-- Netzwerk-Followup-Abschluss (04.08.): Die Empfehl-Batch-Strecke ist komplett retired —
-- Erzeuger in P4 (#4897) geloescht, Token-Route in #4968 entfernt (seit 04.08. deployed),
-- beide Tabellen seit jeher leer (0 Batches / 0 Empfehlungen, mehrfach live verifiziert).
-- Reihenfolge: empfehlungen zuerst (FK werkstatt_empfehlungen_batch_id_fkey -> batches).
drop table if exists public.werkstatt_empfehlungen;
drop table if exists public.werkstatt_empfehlung_batches;