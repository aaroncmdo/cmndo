-- Tail-Batch v1: dies wurde mit `USING (true)` Fallback geschrieben, bricht
-- aber bei INSERT-Policies (dort ist nur WITH CHECK erlaubt).
-- Wird durch v2 ersetzt, beide Files für `db reset`-Reproduzierbarkeit drin.
-- v2-Migration ist identisch bis auf den INSERT-Sonderfall.
SELECT 1 WHERE FALSE; -- no-op (v1 hat nichts appliziert)
